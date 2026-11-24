// ════════════════════════════════════════════════════════════════════════════
// «Verificar traducción» desde el LISTADO, de uno o varios proyectos (v4.1357)
//
// El comité pidió poder marcar como traducidos —verificados por Cadre— los
// proyectos sin abrir cada expediente ni marcar los campos uno por uno. Esta
// ventana carga el estado REAL de cada proyecto (el mismo del servidor),
// muestra qué se va a certificar y, con una sola confirmación, llama al mismo
// endpoint de siempre con `markAllReviewed`: el servidor marca a nombre de
// quien verifica los campos traducidos pendientes de marcar y verifica, todo
// en una transacción. Lo que no está traducido, lo desactualizado y los
// correos o enlaces cambiados siguen bloqueando: esos se resuelven en la
// pestaña «Traducción». Se verifica de a uno (cada llamada lejos de los 120 s).
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { AlertTriangle, BadgeCheck, CheckCircle2, Loader2, X, XCircle } from 'lucide-react';
import { dossierRequest } from '../../../../lib/projectDossier';

interface Row { id: string; publicRef: string; projectName: string }
interface Info {
    status: { total: number; counts: { missing: number; draft: number; reviewed: number; outdated: number } };
    verification: { fingerprint: string; canVerifyMarkingReviewed: boolean; pendingReview: number; blockedReason: string | null; blockedCode: string | null; needsJustification: boolean; nonBlocking: { path: string; label: string; warnings: { message: string }[] }[] };
    actor: { email: string | null; role: string };
}
type Result = { ok: boolean; message: string };

const ROLE: Record<string, string> = { cadre: 'Cadre', admin: 'Administrador', reviewer: 'Revisor' };

const VerifyTranslationsDialog = ({ eventId, rows, onClose, onDone }: { eventId: string; rows: Row[]; onClose: () => void; onDone: () => void }) => {
    const [info, setInfo] = useState<Record<string, Info | { error: string }>>({});
    const [loading, setLoading] = useState(true);
    const [certify, setCertify] = useState(false);
    const [justification, setJustification] = useState('');
    const [busy, setBusy] = useState(false);
    const [results, setResults] = useState<Record<string, Result>>({});
    const [done, setDone] = useState(false);

    useEffect(() => {
        let vivo = true;
        (async () => {
            const out: Record<string, Info | { error: string }> = {};
            for (const r of rows) {
                try { out[r.id] = await dossierRequest<Info>(`/postulaciones/${r.id}/traduccion/en`, eventId); }
                catch (e: any) { out[r.id] = { error: e?.message || 'No se pudo leer' }; }
                if (!vivo) return;
                setInfo({ ...out });
            }
            if (vivo) setLoading(false);
        })();
        return () => { vivo = false; };
    }, [rows, eventId]);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, busy]);

    const ready = rows.filter(r => { const i = info[r.id] as Info; return i && !('error' in i) && i.verification?.canVerifyMarkingReviewed; });
    const blocked = rows.filter(r => !ready.includes(r));
    const pendingMarks = ready.reduce((a, r) => a + ((info[r.id] as Info).verification.pendingReview || 0), 0);
    const needJust = ready.some(r => (info[r.id] as Info).verification.needsJustification);
    const actor = (ready[0] && (info[ready[0].id] as Info).actor) || null;
    const canSubmit = !loading && !busy && ready.length > 0 && certify && (!needJust || justification.trim().length >= 15);

    const run = async () => {
        setBusy(true);
        const out: Record<string, Result> = {};
        for (const r of ready) {
            const i = info[r.id] as Info;
            try {
                const d = await dossierRequest<any>(`/postulaciones/${r.id}/traduccion/en/verificar`, eventId, {
                    method: 'POST',
                    body: { markAllReviewed: true, expectedFingerprint: i.verification.fingerprint, justification: i.verification.needsJustification ? justification : '' },
                });
                out[r.id] = { ok: true, message: d.alreadyVerified ? 'Ya estaba verificada' : `Verificada · versión ${d.version?.versionNumber}` };
            } catch (e: any) { out[r.id] = { ok: false, message: e?.message || 'No se pudo verificar' }; }
            setResults({ ...out });
        }
        setBusy(false); setDone(true); onDone();
    };

    const single = rows.length === 1;
    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-3" role="dialog" aria-modal="true" aria-labelledby="verify-many-title" onClick={() => { if (!busy) onClose(); }}>
            <div className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                <header className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
                    <BadgeCheck size={22} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                    <h2 id="verify-many-title" className="text-base font-bold text-slate-900">
                        {single ? '¿Confirmas la verificación de la traducción?' : `Verificar la traducción de ${rows.length} proyectos`}
                    </h2>
                    <button onClick={onClose} disabled={busy} aria-label="Cerrar" className="ml-auto rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
                </header>
                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4 text-sm text-slate-700">
                    <p>Al verificar, certificas que la versión inglesa de {single ? 'este proyecto' : 'estos proyectos'} fue revisada y conserva el sentido, la precisión y el contexto de la información original.</p>
                    <ul className="space-y-1.5" aria-label="Proyectos">
                        {rows.map(r => {
                            const i = info[r.id] as any;
                            const res = results[r.id];
                            return (
                                <li key={r.id} className="rounded-xl border border-slate-200 px-3 py-2 text-xs">
                                    <p className="font-semibold text-slate-900"><span className="font-mono text-slate-500">{r.publicRef}</span> · {r.projectName}</p>
                                    {!i ? <p className="mt-0.5 flex items-center gap-1 text-slate-500"><Loader2 size={11} className="animate-spin" /> Leyendo la traducción…</p>
                                        : i.error ? <p className="mt-0.5 text-red-700">{i.error}</p>
                                        : res ? <p className={`mt-0.5 flex items-center gap-1 font-semibold ${res.ok ? 'text-emerald-700' : 'text-red-700'}`}>{res.ok ? <CheckCircle2 size={12} /> : <XCircle size={12} />} {res.message}</p>
                                        : i.verification.canVerifyMarkingReviewed ? (
                                            <p className="mt-0.5 text-slate-600">
                                                {i.status.counts.reviewed + i.status.counts.draft} de {i.status.total} campos traducidos
                                                {i.verification.pendingReview ? ` · ${i.verification.pendingReview} se marcarán como revisados` : ' · todos revisados'}
                                                {i.verification.needsJustification ? <span className="font-semibold text-amber-700"> · {i.verification.nonBlocking.length} con avisos</span> : null}
                                            </p>
                                        ) : (
                                            <p className="mt-0.5 flex items-start gap-1 text-amber-800"><AlertTriangle size={12} className="mt-0.5 shrink-0" /> No se puede verificar todavía: {i.verification.blockedReason || 'revísala en la pestaña «Traducción»'}</p>
                                        )}
                                </li>
                            );
                        })}
                    </ul>
                    {!done && ready.length > 0 && (
                        <>
                            {pendingMarks > 0 && (
                                <label className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                                    <input type="checkbox" checked={certify} onChange={e => setCertify(e.target.checked)} className="mt-0.5" />
                                    <span>Confirmo que la traducción fue revisada (por mí o por los Cadres) y que los <strong>{pendingMarks}</strong> campo(s) traducidos que faltan por marcar quedan marcados como revisados a mi nombre.</span>
                                </label>
                            )}
                            {pendingMarks === 0 && (
                                <label className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                                    <input type="checkbox" checked={certify} onChange={e => setCertify(e.target.checked)} className="mt-0.5" />
                                    <span>Confirmo la verificación de {ready.length === 1 ? 'la traducción' : `las ${ready.length} traducciones`}.</span>
                                </label>
                            )}
                            {needJust && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                                    <label htmlFor="verify-many-just" className="text-xs font-semibold text-amber-900">Algunos campos tienen avisos (cifras o largo distinto del original). Explica por qué la traducción es correcta:</label>
                                    <textarea id="verify-many-just" value={justification} onChange={e => setJustification(e.target.value)} rows={3} maxLength={2000}
                                        className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm" placeholder="Ej.: revisado por el Cadre; las cifras están escritas en letras en inglés." />
                                    {justification.trim().length < 15 && <p className="mt-1 text-[11px] text-amber-800">Mínimo 15 caracteres.</p>}
                                </div>
                            )}
                            <p className="text-[11px] text-slate-500">Responsable: {actor?.email || '—'}{actor?.role && ROLE[actor.role] ? ` · ${ROLE[actor.role]}` : ''}. Certifica sólo la traducción, no aprueba el proyecto. Si el club cambia después un texto, la verificación pierde vigencia sola.</p>
                        </>
                    )}
                    {!loading && blocked.length > 0 && !done && (
                        <p className="text-[11px] text-slate-500">{blocked.length} proyecto(s) no se verificarán: ábrelos y completa su traducción en la pestaña «Traducción».</p>
                    )}
                </div>
                <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-3">
                    <button onClick={onClose} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">{done ? 'Cerrar' : 'Cancelar'}</button>
                    {!done && (
                        <button onClick={run} disabled={!canSubmit} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                            {busy ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />} {ready.length > 1 ? `Verificar ${ready.length} traducciones` : 'Confirmar verificación'}
                        </button>
                    )}
                </footer>
            </div>
        </div>
    );
};

export default VerifyTranslationsDialog;
