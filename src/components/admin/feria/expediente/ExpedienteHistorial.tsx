// v4.1324 — Historial del EXPEDIENTE: cada cambio campo a campo (valor
// anterior, nuevo, quién, cuándo y por qué), las correcciones de la
// traducción, las versiones aprobadas, las libretas y las descargas. Se monta
// encima del historial general del proyecto, que sigue igual.
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, History, Loader2 } from 'lucide-react';
import { dossierRequest } from '../../../../lib/projectDossier';

interface Revision { id: string; kind: string; lang: string | null; path: string; label: string | null; before: any; after: any; reason: string | null; actorName: string | null; createdAt: string }

const KIND: Record<string, { label: string; cls: string }> = {
    edit: { label: 'Edición del original', cls: 'bg-blue-50 text-blue-800' },
    translation: { label: 'Traducción', cls: 'bg-violet-50 text-violet-800' },
    translation_review: { label: 'Revisión de traducción', cls: 'bg-emerald-50 text-emerald-800' },
    // v4.1330 — Lo que el club cambió en sus formularios, campo a campo.
    club_edit: { label: 'Edición del club', cls: 'bg-slate-100 text-slate-700' },
    club_edit_post_close: { label: 'Edición del club · después del cierre', cls: 'bg-amber-50 text-amber-800' },
};
const when = (iso: string) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
const show = (v: any) => {
    if (v === null || v === undefined || v === '') return '(vacío)';
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
};

const RevisionItem = ({ r }: { r: Revision }) => {
    const [open, setOpen] = useState(false);
    const k = KIND[r.kind] || { label: r.kind, cls: 'bg-slate-100 text-slate-700' };
    const long = show(r.before).length + show(r.after).length > 220;
    return (
        <li className="rounded-lg border border-slate-100 bg-white px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${k.cls}`}>{k.label}{r.lang ? ` · ${r.lang.toUpperCase()}` : ''}</span>
                <span className="font-semibold text-slate-800">{r.label || r.path}</span>
                <span className="ml-auto text-xs text-slate-400">{when(r.createdAt)} · {r.actorName || 'Sistema'}</span>
            </div>
            {r.reason && <p className="mt-1 text-xs text-slate-600">Motivo: {r.reason}</p>}
            <div className={`mt-1.5 grid gap-2 text-xs sm:grid-cols-2 ${!open && long ? 'max-h-24 overflow-hidden' : ''}`}>
                <div className="rounded bg-red-50/60 px-2 py-1.5 text-slate-600"><span className="font-semibold text-red-700">Antes: </span><span className="whitespace-pre-line break-words">{show(r.before)}</span></div>
                <div className="rounded bg-emerald-50/60 px-2 py-1.5 text-slate-700"><span className="font-semibold text-emerald-700">Después: </span><span className="whitespace-pre-line break-words">{show(r.after)}</span></div>
            </div>
            {long && <button onClick={() => setOpen(o => !o)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-700">{open ? <><ChevronUp size={12} /> Ver menos</> : <><ChevronDown size={12} /> Ver completo</>}</button>}
        </li>
    );
};

const ExpedienteHistorial = ({ submissionId, eventId, refreshKey }: { submissionId: string; eventId: string; refreshKey?: number }) => {
    const [data, setData] = useState<{ revisions: Revision[]; translationVersions: any[]; booklets: any[]; exports: any[] } | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        setData(null); setError(null);
        dossierRequest<any>(`/postulaciones/${submissionId}/expediente/historial`, eventId).then(setData).catch(e => setError(e?.message || 'No se pudo cargar'));
    }, [submissionId, eventId, refreshKey]);

    return (
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h4 className="mb-2 inline-flex items-center gap-1.5 text-sm font-bold text-slate-900"><History size={15} /> Cambios del expediente</h4>
            {error && <p className="text-sm text-red-700">{error}</p>}
            {!data && !error && <p className="text-sm text-slate-500"><Loader2 size={14} className="mr-1.5 inline animate-spin" /> Cargando…</p>}
            {data && (
                <>
                    {data.revisions.length ? <ul className="space-y-2">{data.revisions.map(r => <RevisionItem key={r.id} r={r} />)}</ul> : <p className="text-sm text-slate-500">Sin modificaciones del club, administrativas ni traducciones todavía.</p>}
                    {(data.translationVersions.length > 0 || data.booklets.length > 0 || data.exports.length > 0) && (
                        <div className="mt-3 grid gap-3 text-xs text-slate-600 sm:grid-cols-3">
                            <div><p className="mb-1 font-semibold text-slate-700">Traducciones aprobadas</p>{data.translationVersions.length ? data.translationVersions.map(v => <p key={v.id}>v{v.versionNumber} · {when(v.approvedAt)} · {v.approvedBy}</p>) : <p>—</p>}</div>
                            <div><p className="mb-1 font-semibold text-slate-700">Libretas</p>{data.booklets.length ? data.booklets.map(b => <p key={b.id}>{b.lang.toUpperCase()} v{b.versionNumber} · {b.status === 'approved' ? 'aprobada' : 'borrador'} · {when(b.createdAt)}</p>) : <p>—</p>}</div>
                            <div><p className="mb-1 font-semibold text-slate-700">Descargas de fichas</p>{data.exports.length ? data.exports.slice(0, 12).map(x => <p key={x.id}>{x.lang === 'bilingual' ? 'Bilingüe' : x.lang.toUpperCase()}{Number(x.projects) > 1 ? ` (lote de ${x.projects})` : ''} · {when(x.createdAt)} · {x.actorName}</p>) : <p>—</p>}</div>
                        </div>
                    )}
                </>
            )}
        </section>
    );
};

export default ExpedienteHistorial;
