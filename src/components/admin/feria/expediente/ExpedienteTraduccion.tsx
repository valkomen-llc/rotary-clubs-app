// ════════════════════════════════════════════════════════════════════════════
// Expediente → «Traducción» (v4.1324.0)
//
// Editor bilingüe de dos columnas: «Español — Original» y «English —
// Translation». La IA hace el primer borrador (sólo de los textos narrativos);
// una persona lo corrige, marca cada campo como revisado y quien tiene permiso
// lo aprueba. Regenerar UN campo no toca los demás; «Regenerar todo» respeta
// lo revisado y lo corregido a mano. Si el español cambia después, el campo
// queda «desactualizado» con el original anterior a la vista.
//
// v4.1356 — «Aprobar versión inglesa» pasa a ser «Verificar traducción»: la
// MISMA aprobación, reforzada (Traducción verificada por Cadre). Sólo se
// habilita con todo traducido y revisado, sin desactualizados, sin avisos
// bloqueantes y sin cambios sin guardar; abre una ventana de confirmación con
// lo que se certifica y, si hay avisos no bloqueantes, pide la justificación.
// La verificación vale para la huella exacta que se revisó: si el club cambia
// el original, pierde vigencia sola. El administrador puede revocarla con
// motivo. Todo queda en «Historial de verificación».
// ════════════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, BadgeCheck, BookOpen, CheckCircle2, History, Languages, Loader2, RefreshCw, Save, ShieldOff, Sparkles, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import type { DossierCaps, TranslationField, TranslationStatus } from '../../../../lib/projectDossier';
import { DossierApiError, dossierRequest, FIELD_META, TRANSLATION_META } from '../../../../lib/projectDossier';
import GlosarioModal from './GlosarioModal';
import { TRACKING_META, fmtWhen as fmtBogota, roleLabel, type TranslationTracking } from '../../../../lib/translationTracking';

interface VerificationInfo {
    fingerprint: string;
    summary: { total: number; translated: number; reviewed: number; warnings: number; reviewers: Record<string, number>; origins: { ai: number; manual: number }; nextVersionNumber: number };
    canVerify: boolean; blockedReason: string | null; blockedCode: string | null;
    needsJustification: boolean;
    nonBlocking: { path: string; label: string; warnings: { code: string; message: string }[] }[];
    blocking: { path: string; label: string; warnings: { code: string; message: string }[] }[];
    revokedAt: string | null; revokedBy: string | null; revokeReason: string | null;
}
interface TrEvent { id: string; action: string; fromState: string | null; toState: string | null; versionNumber: number | null; reviewedCount: number | null; totalCount: number | null; paths: any; note: string | null; reason: string | null; assigneeEmail: string | null; previousAssignee: string | null; recipient: string | null; deliveryStatus: string | null; actorName: string | null; actorRole: string | null; createdAt: string }
interface VersionRow { id: string; versionNumber: number; approvedBy: string | null; approvedAt: string; note: string | null; kind: string | null; approvedRole: string | null; totalCount: number | null; reviewedCount: number | null; warningsCount: number | null; justification: string | null }

const EVENT_LABEL: Record<string, string> = {
    verified: 'Traducción verificada', invalidated: 'La verificación perdió vigencia', revoked: 'Verificación revocada',
    assigned: 'Cadre asignado', reassigned: 'Cadre reasignado', unassigned: 'Asignación retirada',
};
const stateName = (k: string | null) => (k && (TRACKING_META as any)[k] ? (TRACKING_META as any)[k].label : k || '—');

// La ventana de confirmación de la verificación. Componente de primer nivel
// (nunca dentro de otro: perdería el foco al escribir la justificación).
const VerifyDialog = ({ projectName, info, actorEmail, actorRole, busy, onCancel, onConfirm }: {
    projectName: string; info: VerificationInfo; actorEmail: string | null; actorRole: string; busy: boolean;
    onCancel: () => void; onConfirm: (justification: string, note: string) => void;
}) => {
    const [justification, setJustification] = useState('');
    const [note, setNote] = useState('');
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onCancel]);
    const s = info.summary;
    const short = info.needsJustification && justification.trim().length < 15;
    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-3" role="dialog" aria-modal="true" aria-labelledby="verify-title" onClick={onCancel}>
            <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
                    <BadgeCheck size={22} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    <h2 id="verify-title" className="text-base font-bold text-slate-900">¿Confirmas la verificación de la traducción?</h2>
                    <button onClick={onCancel} aria-label="Cerrar" className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
                </header>
                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm text-slate-700">
                    <p>Al verificar este proyecto, certificas que la información correspondiente a su versión inglesa ha sido revisada y que conserva el sentido, la precisión y el contexto de la información original.</p>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl bg-slate-50 p-3 text-xs">
                        <dt className="text-slate-500">Proyecto</dt><dd className="font-semibold text-slate-900">{projectName}</dd>
                        <dt className="text-slate-500">Campos traducidos</dt><dd>{s.translated} de {s.total}{s.origins.manual ? ` (${s.origins.manual} editados a mano, ${s.origins.ai} de la IA)` : ''}</dd>
                        <dt className="text-slate-500">Campos revisados</dt><dd>{s.reviewed} de {s.total}</dd>
                        <dt className="text-slate-500">Avisos pendientes</dt><dd className={s.warnings ? 'font-semibold text-amber-700' : ''}>{s.warnings || 'Ninguno'}</dd>
                        <dt className="text-slate-500">Responsable</dt><dd>{actorEmail || '—'}{actorRole ? ` · ${roleLabel(actorRole)}` : ''}</dd>
                        <dt className="text-slate-500">Versión</dt><dd>{s.nextVersionNumber}</dd>
                    </dl>
                    {info.needsJustification && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                            <p className="text-xs font-semibold text-amber-900">Estos campos tienen avisos no bloqueantes. Explica por qué la traducción es correcta:</p>
                            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-amber-900">
                                {info.nonBlocking.map(f => <li key={f.path}>{f.label}: {f.warnings.map(w => w.message).join(' · ')}</li>)}
                            </ul>
                            <label className="mt-2 block text-xs font-semibold text-amber-900" htmlFor="verify-justification">Justificación (queda registrada con la versión)</label>
                            <textarea id="verify-justification" value={justification} onChange={e => setJustification(e.target.value)} rows={3} maxLength={2000}
                                className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm" placeholder="Ej.: la cifra está escrita en letras en la versión inglesa." />
                            {short && <p className="mt-1 text-[11px] text-amber-800">Mínimo 15 caracteres.</p>}
                        </div>
                    )}
                    <label className="block text-xs font-semibold text-slate-600" htmlFor="verify-note">Observación (opcional)</label>
                    <input id="verify-note" value={note} onChange={e => setNote(e.target.value)} maxLength={500} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                    <p className="text-[11px] text-slate-500">La verificación certifica sólo la traducción: no es una aprobación técnica, financiera ni administrativa del proyecto. Si el club cambia después un texto, la verificación pierde vigencia sola.</p>
                </div>
                <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">
                    <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
                    <button onClick={() => onConfirm(justification, note)} disabled={busy || short}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />} Confirmar verificación
                    </button>
                </footer>
            </div>
        </div>
    );
};

const RevokeDialog = ({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: (reason: string) => void }) => {
    const [reason, setReason] = useState('');
    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-3" role="dialog" aria-modal="true" aria-labelledby="revoke-title" onClick={onCancel}>
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
                <h2 id="revoke-title" className="flex items-center gap-2 text-base font-bold text-slate-900"><ShieldOff size={18} className="text-red-600" /> Revocar la verificación</h2>
                <p className="mt-2 text-sm text-slate-600">La traducción deja de figurar como verificada y la insignia desaparece. La versión verificada y las revisiones campo a campo se conservan.</p>
                <label className="mt-3 block text-xs font-semibold text-slate-600" htmlFor="revoke-reason">Motivo (obligatorio, queda en la bitácora)</label>
                <textarea id="revoke-reason" value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={1000} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <div className="mt-4 flex justify-end gap-2">
                    <button onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancelar</button>
                    <button onClick={() => onConfirm(reason)} disabled={busy || reason.trim().length < 10} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                        {busy && <Loader2 size={14} className="animate-spin" />} Revocar
                    </button>
                </div>
            </div>
        </div>
    );
};

const BLUE = '#17458F';
type Filter = 'all' | 'pending' | 'outdated' | 'warnings';

interface Props {
    submissionId: string;
    eventId: string;
    access: DossierCaps;
    wide?: boolean;
    autoStart?: boolean;
    /** v4.1356 — Nombre del proyecto (para la ventana de verificación). */
    projectName?: string;
    onStatusChange: (s: TranslationStatus) => void;
    /** v4.1356 — El seguimiento leído del servidor (para la pestaña del expediente). */
    onTrackingChange?: (t: TranslationTracking) => void;
    /** v4.1356 — Se verificó o revocó: el listado y los indicadores se refrescan. */
    onVerificationChange?: () => void;
    onDirtyChange?: (dirty: boolean) => void;
}

const fmtWhen = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '');

const ExpedienteTraduccion = ({ submissionId, eventId, access, wide = false, autoStart = false, projectName = '', onStatusChange, onTrackingChange, onVerificationChange, onDirtyChange }: Props) => {
    const [status, setStatus] = useState<TranslationStatus | null>(null);
    const [versions, setVersions] = useState<VersionRow[]>([]);
    const [tracking, setTracking] = useState<TranslationTracking | null>(null);
    const [verification, setVerification] = useState<VerificationInfo | null>(null);
    const [events, setEvents] = useState<TrEvent[]>([]);
    const [actor, setActor] = useState<{ email: string | null; role: string }>({ email: null, role: '' });
    const [showVerify, setShowVerify] = useState(false);
    const [showRevoke, setShowRevoke] = useState(false);
    const [edits, setEdits] = useState<Record<string, { text: string; reviewed: boolean }>>({});
    const [busy, setBusy] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>('all');
    const [includeReviewed, setIncludeReviewed] = useState(false);
    const [showGlossary, setShowGlossary] = useState(false);
    const [autoStarted, setAutoStarted] = useState(false);
    // El aviso al padre va por una ref: si dependiera de la función, un padre
    // que la recree en cada render dispararía la carga en bucle.
    const notify = useRef(onStatusChange);
    notify.current = onStatusChange;
    const notifyTracking = useRef(onTrackingChange);
    notifyTracking.current = onTrackingChange;
    const notifyVerification = useRef(onVerificationChange);
    notifyVerification.current = onVerificationChange;

    const load = useCallback(async () => {
        try {
            const d = await dossierRequest<{ status: TranslationStatus; versions: VersionRow[]; tracking: TranslationTracking; verification: VerificationInfo; events: TrEvent[]; actor: { email: string | null; role: string } }>(`/postulaciones/${submissionId}/traduccion/en`, eventId);
            setStatus(d.status); setVersions(d.versions || []); notify.current(d.status);
            setTracking(d.tracking || null); setVerification(d.verification || null); setEvents(d.events || []);
            if (d.tracking) notifyTracking.current?.(d.tracking);
            if (d.actor) setActor(d.actor);
        } catch (e: any) { toast.error(e?.message || 'No se pudo cargar la traducción'); }
    }, [submissionId, eventId]);
    useEffect(() => { load(); }, [load]);

    const dirtyCount = Object.keys(edits).length;
    useEffect(() => { onDirtyChange?.(dirtyCount > 0); }, [dirtyCount, onDirtyChange]);

    // Tras cada cambio se recarga el seguimiento (estado, huella, permisos de
    // verificación): el servidor es quien decide si ya se puede verificar.
    const apply = (s: TranslationStatus) => { setStatus(s); notify.current(s); load(); };

    const generate = useCallback(async (paths?: string[]) => {
        setBusy(paths?.length === 1 ? paths[0] : 'all');
        try {
            const d = await dossierRequest<any>(`/postulaciones/${submissionId}/traduccion/en/generar`, eventId, { method: 'POST', body: paths ? { paths } : { includeReviewed } });
            apply(d.status);
            if (paths) setEdits(e => { const n = { ...e }; paths.forEach(p => delete n[p]); return n; });
            if (d.translated === 0) toast.info(d.message || 'No había campos pendientes.');
            else toast.success(`${d.translated} campo(s) traducidos. Revísalos antes de aprobar.${d.errors?.length ? ` Algunos fallaron: ${d.errors[0]}` : ''}`);
        } catch (e: any) {
            if (e instanceof DossierApiError && e.body?.status) apply(e.body.status);
            toast.error(e?.message || 'No se pudo traducir');
        } finally { setBusy(null); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [submissionId, eventId, includeReviewed]);

    // «Traducir al inglés» desde el menú de la tabla: arranca solo, una vez.
    useEffect(() => {
        if (autoStart && !autoStarted && status && status.state === 'not_started' && access.translate && status.total > 0) {
            setAutoStarted(true);
            generate();
        }
    }, [autoStart, autoStarted, status, access.translate, generate]);

    const save = async (extra?: Record<string, { text: string; reviewed: boolean }>) => {
        const payload = { ...edits, ...(extra || {}) };
        const fields = Object.entries(payload).map(([path, v]) => ({ path, text: v.text, reviewed: v.reviewed }));
        if (!fields.length) return;
        setBusy('save');
        try {
            const d = await dossierRequest<any>(`/postulaciones/${submissionId}/traduccion/en`, eventId, { method: 'PUT', body: { fields } });
            apply(d.status); setEdits({});
            toast.success(`Traducción guardada (${d.saved} campo${d.saved === 1 ? '' : 's'}).`);
        } catch (e: any) { toast.error(e?.message || 'No se pudo guardar'); } finally { setBusy(null); }
    };

    const markAllReviewed = () => {
        if (!status?.fields) return;
        const extra: Record<string, { text: string; reviewed: boolean }> = {};
        for (const f of status.fields) {
            const cur = edits[f.path];
            const text = cur?.text ?? f.text ?? '';
            if (text.trim() && f.state !== 'outdated' && !f.reviewed) extra[f.path] = { text, reviewed: true };
        }
        if (!Object.keys(extra).length) { toast.info('No hay campos traducidos pendientes de marcar (los desactualizados se revisan uno por uno).'); return; }
        save(extra);
    };

    const verify = async (justification: string, note: string) => {
        if (dirtyCount) { toast.error('Guarda los cambios antes de verificar.'); return; }
        if (!verification) return;
        setBusy('approve');
        try {
            const d = await dossierRequest<any>(`/postulaciones/${submissionId}/traduccion/en/verificar`, eventId, { method: 'POST', body: { justification, note, expectedFingerprint: verification.fingerprint } });
            setShowVerify(false);
            setStatus(d.status); notify.current(d.status);
            if (d.tracking) { setTracking(d.tracking); notifyTracking.current?.(d.tracking); }
            notifyVerification.current?.();
            toast.success(d.alreadyVerified ? 'La traducción ya estaba verificada.' : `Traducción verificada (versión ${d.version.versionNumber}).`);
            load();
        } catch (e: any) {
            if (e instanceof DossierApiError && e.body?.code === 'changed') { setShowVerify(false); toast.error(e.message); load(); }
            else toast.error(e?.message || 'No se pudo verificar');
        } finally { setBusy(null); }
    };

    const revoke = async (reason: string) => {
        setBusy('revoke');
        try {
            const d = await dossierRequest<any>(`/postulaciones/${submissionId}/traduccion/en/revocar`, eventId, { method: 'POST', body: { reason } });
            setShowRevoke(false);
            if (d.tracking) { setTracking(d.tracking); notifyTracking.current?.(d.tracking); }
            notifyVerification.current?.();
            toast.success('Verificación revocada.');
            load();
        } catch (e: any) { toast.error(e?.message || 'No se pudo revocar'); } finally { setBusy(null); }
    };

    const fields = status?.fields || [];
    const shown = useMemo(() => fields.filter(f => {
        if (filter === 'pending') return f.state === 'missing' || f.state === 'draft';
        if (filter === 'outdated') return f.state === 'outdated';
        if (filter === 'warnings') return f.warnings.length > 0;
        return true;
    }), [fields, filter]);

    if (!status) return <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 size={18} className="mr-2 animate-spin" /> Cargando traducción…</div>;
    const meta = TRANSLATION_META[status.state];
    const generating = busy === 'all' || status.state === 'generating';

    return (
        <div className="space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Traducción inglesa</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            {tracking ? (
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${TRACKING_META[tracking.state].cls}`}>
                                    {tracking.state === 'verified' && <BadgeCheck size={13} aria-hidden="true" />} {TRACKING_META[tracking.state].label}
                                </span>
                            ) : <span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${meta.cls}`}>{meta.label}</span>}
                            <span className="text-xs text-slate-500">{status.counts.reviewed} de {status.total} campos revisados</span>
                            {status.counts.outdated > 0 && <span className="text-xs font-semibold text-red-700">· {status.counts.outdated} desactualizado(s)</span>}
                            {status.warnings > 0 && <span className="text-xs font-semibold text-amber-700">· {status.warnings} con avisos</span>}
                        </div>
                        {tracking && tracking.state !== 'no_content' && (
                            <p className="mt-1 text-xs text-slate-600">Traducción <strong>{tracking.translatedPct ?? 0} %</strong> · Revisión <strong>{tracking.reviewedPct ?? 0} %</strong>{tracking.assignee ? <> · <UserRound size={11} className="inline" aria-hidden="true" /> Cadre: <strong>{tracking.assignee.name || tracking.assignee.email}</strong></> : ' · Sin Cadre asignado'}</p>
                        )}
                        {status.lastError && <p className="mt-1 text-xs text-red-700">Último error: {status.lastError}</p>}
                        <p className="mt-1 text-[11px] text-slate-400">El estado de traducción es independiente del estado de la postulación y del pago.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => setShowGlossary(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"><BookOpen size={13} /> Glosario</button>
                        {access.translate && (
                            <button onClick={() => generate()} disabled={!!busy || status.total === 0}
                                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: BLUE }}>
                                {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                {status.state === 'not_started' || status.state === 'error' ? 'Traducir proyecto al inglés' : 'Regenerar pendientes'}
                            </button>
                        )}
                        {access.approveTranslation && (
                            <button onClick={() => { if (dirtyCount) { toast.error('Guarda los cambios antes de verificar.'); return; } setShowVerify(true); }}
                                disabled={!!busy || !verification?.canVerify || dirtyCount > 0}
                                title={dirtyCount ? 'Guarda los cambios antes de verificar.' : (verification?.blockedReason || 'Certificar la versión inglesa')}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                                {busy === 'approve' ? <Loader2 size={13} className="animate-spin" /> : <BadgeCheck size={13} />} Verificar traducción
                            </button>
                        )}
                    </div>
                </div>
                {access.approveTranslation && verification && !verification.canVerify && verification.blockedCode !== 'verified' && verification.blockedReason && status.total > 0 && (
                    <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Para verificar: {verification.blockedReason}{verification.blocking.length ? ` (${verification.blocking.map(b => b.label).join(', ')})` : ''}</p>
                )}
                {dirtyCount > 0 && access.approveTranslation && <p className="mt-2 text-xs font-semibold text-amber-700">Tienes {dirtyCount} cambio(s) sin guardar: guárdalos antes de verificar.</p>}
                {tracking?.state === 'verified' && tracking.verification && (
                    <div className="mt-3 flex flex-wrap items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-900">
                        <BadgeCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                        <p className="flex-1">
                            <strong>Traducción verificada</strong> por {tracking.verification.by}{tracking.verification.role ? ` (${roleLabel(tracking.verification.role)})` : ''} el {fmtBogota(tracking.verification.at)} · versión {tracking.verification.versionNumber} · {tracking.verification.fieldCount ?? tracking.reviewed} campos revisados · <strong>vigente</strong>.
                        </p>
                        {access.manageTranslation && (
                            <button onClick={() => setShowRevoke(true)} className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-2.5 py-1 font-semibold text-red-700 hover:bg-red-50"><ShieldOff size={12} /> Revocar</button>
                        )}
                    </div>
                )}
                {tracking?.state === 'needs_update' && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-900">
                        <p className="flex items-center gap-1.5 font-bold"><RefreshCw size={13} aria-hidden="true" /> Requiere actualización: el original cambió después de la verificación (versión {tracking.verification?.versionNumber ?? '—'}).</p>
                        {tracking.invalidatedPaths.length > 0 && <p className="mt-1">Campos afectados: {tracking.invalidatedPaths.map(p => p.label).join(' · ')}.</p>}
                        <p className="mt-1">Revisa sólo esos campos (filtro «Desactualizados»), márcalos como revisados y vuelve a verificar. La versión verificada anterior se conserva.</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <button onClick={() => setFilter('outdated')} className="rounded-lg border border-red-300 bg-white px-2.5 py-1 font-semibold text-red-700">Ver campos afectados</button>
                            {access.manageTranslation && <button onClick={() => setShowRevoke(true)} className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-2.5 py-1 font-semibold text-red-700"><ShieldOff size={12} /> Revocar la verificación</button>}
                        </div>
                    </div>
                )}
                {tracking?.legacyApproved && (
                    <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">Esta traducción se aprobó el {fmtBogota(tracking.verification?.at)} ({tracking.verification?.by}) con el mecanismo anterior. No se certifica retroactivamente: un Cadre debe verificarla. La ficha inglesa la sigue usando, marcada como pendiente de verificación.</p>
                )}
                {verification?.revokedAt && tracking?.state !== 'verified' && (
                    <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">Verificación revocada el {fmtBogota(verification.revokedAt)} por {verification.revokedBy}: {verification.revokeReason}</p>
                )}
                {access.translate && status.state !== 'not_started' && (
                    <label className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                        <input type="checkbox" checked={includeReviewed} onChange={e => setIncludeReviewed(e.target.checked)} />
                        Al regenerar, rehacer también los campos ya revisados o corregidos a mano (se guardan en el historial)
                    </label>
                )}
                {generating && <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800"><Loader2 size={12} className="mr-1.5 inline animate-spin" /> Traduciendo con IA… un proyecto completo puede tardar hasta un minuto. Sólo se envían los textos narrativos: nombres, correos, teléfonos, cifras y documentos se conservan.</p>}
                {status.total === 0 && <p className="mt-3 text-xs text-slate-500">Este proyecto todavía no tiene textos narrativos para traducir.</p>}
            </section>

            {status.total > 0 && (
                <div className="sticky top-0 z-[5] -mx-6 flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/95 px-6 py-2.5 backdrop-blur">
                    {([['all', `Todos (${fields.length})`], ['pending', `Por revisar (${status.counts.missing + status.counts.draft})`], ['outdated', `Desactualizados (${status.counts.outdated})`], ['warnings', `Con avisos (${status.warnings})`]] as [Filter, string][]).map(([k, l]) => (
                        <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 text-xs font-semibold ${filter === k ? 'text-white' : 'border border-slate-300 bg-white text-slate-600'}`} style={filter === k ? { background: BLUE } : undefined}>{l}</button>
                    ))}
                    <div className="ml-auto flex flex-wrap gap-2">
                        {access.translate && <button onClick={markAllReviewed} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"><CheckCircle2 size={13} /> Marcar todos como revisados</button>}
                        {access.translate && <button onClick={() => save()} disabled={!dirtyCount || !!busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50" style={{ background: BLUE }}>{busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar borrador{dirtyCount ? ` (${dirtyCount})` : ''}</button>}
                    </div>
                </div>
            )}

            {shown.map((f: TranslationField, i) => {
                const prevSection = i > 0 ? shown[i - 1].sectionTitle + shown[i - 1].groupKey : null;
                const edit = edits[f.path];
                const text = edit?.text ?? f.text ?? '';
                const reviewed = edit?.reviewed ?? f.reviewed;
                const fm = FIELD_META[f.state];
                return (
                    <div key={f.path}>
                        {prevSection !== f.sectionTitle + f.groupKey && <h4 className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide" style={{ color: BLUE }}>{f.sectionTitle}</h4>}
                        <article className={`rounded-xl border bg-white ${f.state === 'outdated' ? 'border-red-200' : edit ? 'border-amber-300' : 'border-slate-200'}`} aria-label={`Traducción de ${f.label}`}>
                            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2">
                                <span className="text-sm font-semibold text-slate-800">{f.label}</span>
                                {f.labelEn && <span className="text-xs text-slate-400">· {f.labelEn}</span>}
                                <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${fm.cls}`}>{fm.label}</span>
                                {f.origin && <span className="text-[11px] text-slate-400">{f.origin === 'ai' ? 'Generada por IA' : 'Editada manualmente'}</span>}
                                {f.reviewed && f.reviewedBy && f.state === 'reviewed' && <span className="text-[11px] text-emerald-700" title={f.reviewedAt ? fmtWhen(f.reviewedAt) : undefined}>· Revisado por {f.reviewedBy}</span>}
                            </div>
                            <div className={`grid gap-0 ${wide ? 'md:grid-cols-2' : 'sm:grid-cols-2'}`}>
                                <div className="border-b border-slate-100 p-4 sm:border-b-0 sm:border-r">
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Español — Original</p>
                                    <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{f.source}</p>
                                    {f.state === 'outdated' && f.previousSource && (
                                        <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
                                            <p className="font-semibold">El original cambió después de traducirse. Antes decía:</p>
                                            <p className="mt-0.5 whitespace-pre-line text-red-700/90">{f.previousSource}</p>
                                        </div>
                                    )}
                                </div>
                                <div className="p-4">
                                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">English — Translation</p>
                                    {access.translate ? (
                                        <textarea value={text} rows={Math.min(14, Math.max(3, Math.ceil(Math.max(text.length, f.source.length) / 70)))}
                                            onChange={e => setEdits(x => ({ ...x, [f.path]: { text: e.target.value, reviewed: false } }))}
                                            placeholder="Sin traducir todavía" aria-label={`Traducción al inglés de ${f.label}`}
                                            className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed" />
                                    ) : (
                                        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{text || <span className="italic text-slate-400">Sin traducir todavía</span>}</p>
                                    )}
                                    {f.warnings.length > 0 && (
                                        <ul className="mt-2 space-y-1">
                                            {f.warnings.map(w => <li key={w.code} className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> {w.message}</li>)}
                                        </ul>
                                    )}
                                    {access.translate && (
                                        <div className="mt-2 flex flex-wrap items-center gap-3">
                                            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                                                <input type="checkbox" checked={reviewed} disabled={!text.trim()}
                                                    onChange={e => setEdits(x => ({ ...x, [f.path]: { text, reviewed: e.target.checked } }))} />
                                                Revisado
                                            </label>
                                            <button onClick={() => generate([f.path])} disabled={!!busy}
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline disabled:opacity-50">
                                                {busy === f.path ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Regenerar este campo
                                            </button>
                                            {f.updatedAt && <span className="text-[11px] text-slate-400">{fmtWhen(f.updatedAt)}{f.updatedBy ? ` · ${f.updatedBy}` : ''}</span>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </article>
                    </div>
                );
            })}
            {status.total > 0 && !shown.length && <p className="py-8 text-center text-sm text-slate-500">No hay campos en este filtro.</p>}

            {(versions.length > 0 || events.length > 0) && (
                <section className="rounded-xl border border-slate-200 bg-white p-4">
                    <h4 className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-slate-900"><History size={15} /> Historial de verificación</h4>
                    {events.length > 0 && (
                        <ol className="space-y-1.5 text-xs text-slate-600">
                            {events.filter(e => EVENT_LABEL[e.action]).map(e => (
                                <li key={e.id} className="border-l-2 border-slate-200 pl-2">
                                    <span className="font-semibold text-slate-800">{EVENT_LABEL[e.action]}</span>
                                    {e.versionNumber ? ` · versión ${e.versionNumber}` : ''} · {fmtBogota(e.createdAt)} · {e.actorName || '—'}{e.actorRole ? ` (${roleLabel(e.actorRole)})` : ''}
                                    {(e.fromState || e.toState) && e.action !== 'assigned' && e.action !== 'reassigned' && e.action !== 'unassigned' && <span className="text-slate-400"> · {stateName(e.fromState)} → {stateName(e.toState)}</span>}
                                    {e.reviewedCount !== null && e.totalCount ? <span> · {e.reviewedCount}/{e.totalCount} campos revisados</span> : null}
                                    {e.assigneeEmail && e.action !== 'invalidated' && <span> · {e.previousAssignee ? `de ${e.previousAssignee} a ` : ''}{e.assigneeEmail}</span>}
                                    {e.action === 'unassigned' && e.previousAssignee && <span> · antes: {e.previousAssignee}</span>}
                                    {Array.isArray(e.paths) && e.action === 'invalidated' && <span className="block text-red-700">Campos afectados: {e.paths.map((p: any) => p.label).join(' · ')}{e.recipient ? ` — aviso a ${e.recipient} (${e.deliveryStatus === 'sent' ? 'enviado' : 'falló'})` : ''}</span>}
                                    {e.note && <span className="block text-slate-500">Observación: {e.note}</span>}
                                    {e.reason && <span className="block text-slate-500">{e.action === 'verified' ? 'Justificación de avisos' : 'Motivo'}: {e.reason}</span>}
                                </li>
                            ))}
                        </ol>
                    )}
                    {versions.length > 0 && (
                        <>
                            <h5 className="mb-1 mt-3 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500"><Languages size={13} /> Versiones (inmutables)</h5>
                            <ul className="space-y-1 text-xs text-slate-600">
                                {versions.map(v => <li key={v.id}>Versión {v.versionNumber} · {v.kind === 'verification' ? 'verificada' : 'aprobada (mecanismo anterior)'} · {fmtWhen(v.approvedAt)} · {v.approvedBy}{v.approvedRole ? ` (${roleLabel(v.approvedRole)})` : ''}{v.reviewedCount !== null && v.totalCount ? ` · ${v.reviewedCount}/${v.totalCount} campos` : ''}{v.note ? ` — ${v.note}` : ''}{v.justification ? ` — justificación: ${v.justification}` : ''}</li>)}
                            </ul>
                        </>
                    )}
                </section>
            )}

            {showVerify && verification && (
                <VerifyDialog projectName={projectName || 'Proyecto'} info={verification} actorEmail={actor.email} actorRole={actor.role} busy={busy === 'approve'}
                    onCancel={() => setShowVerify(false)} onConfirm={verify} />
            )}
            {showRevoke && <RevokeDialog busy={busy === 'revoke'} onCancel={() => setShowRevoke(false)} onConfirm={revoke} />}
            {showGlossary && <GlosarioModal eventId={eventId} canManage={access.config} onClose={() => setShowGlossary(false)} />}
        </div>
    );
};

export default ExpedienteTraduccion;
