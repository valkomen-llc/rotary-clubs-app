// ════════════════════════════════════════════════════════════════════════════
// Bloque «Seguimiento de traducciones» sobre la tabla de Proyectos postulados
// (v4.1356.0)
//
// Indicadores calculados por el SERVIDOR sobre los proyectos que pasan los
// filtros activos (los de siempre y los documentales), SIN la vista de
// traducción elegida: cada tarjeta dice cuántos hay en su grupo y es un
// filtro de la tabla. Para no saturar, arranca contraído (una línea con el
// avance general) y se expande; la preferencia queda en el navegador.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, ChevronDown, ChevronUp, Languages, Loader2, Mail, RefreshCw, Settings, UserPlus } from 'lucide-react';
import { dossierRequest } from '../../../../lib/projectDossier';
import { fmtWhen, type TranslationSummary } from '../../../../lib/translationTracking';

interface Props {
    eventId: string;
    /** Los filtros activos del listado (sin `tr` ni `trCadre`), como query string. */
    query: string;
    activeView: string;
    activeCadre: string;
    onPickView: (key: string) => void;
    onPickCadre: (email: string) => void;
    onAssign: () => void;
    onRemind: () => void;
    onConfig: () => void;
    selectedCount: number;
    reloadKey: number;
    onSummary?: (s: TranslationSummary | null) => void;
}

const CARDS: { view: string; label: string; key: keyof TranslationSummary['kpis']; tone: string; hint: string }[] = [
    { view: 'all', label: 'Proyectos con textos', key: 'applicable', tone: 'text-slate-900', hint: 'Proyectos con textos para traducir, dentro de los filtros activos' },
    { view: 'sin_traducir', label: 'Sin traducir', key: 'untranslated', tone: 'text-slate-600', hint: 'Todavía no hay traducción' },
    { view: 'incompleta', label: 'En progreso', key: 'inProgress', tone: 'text-sky-700', hint: 'Hay campos traducidos, pero no todos' },
    { view: 'por_revisar', label: 'Pendientes de revisión', key: 'pendingReview', tone: 'text-orange-700', hint: 'Traducida, ningún campo revisado por una persona' },
    { view: 'en_revision', label: 'En revisión', key: 'inReview', tone: 'text-blue-700', hint: 'Un Cadre está revisando campo a campo' },
    { view: 'verificada', label: 'Verificadas', key: 'verified', tone: 'text-emerald-700', hint: 'Verificadas y vigentes' },
    { view: 'desactualizada', label: 'Requieren actualización', key: 'needsUpdate', tone: 'text-red-700', hint: 'El original cambió después de verificarse' },
    { view: 'lista', label: 'Listas para verificar', key: 'readyToVerify', tone: 'text-indigo-700', hint: 'Todo revisado: falta el clic de verificación' },
    { view: 'sin_cadre', label: 'Sin Cadre asignado', key: 'unassigned', tone: 'text-slate-600', hint: 'Nadie tiene asignada su revisión' },
    { view: 'con_avisos', label: 'Con avisos', key: 'withWarnings', tone: 'text-amber-700', hint: 'Cifras, correos, enlaces o largo distinto del original' },
];

const readOpen = () => { try { return localStorage.getItem('pp-tr-open') === '1'; } catch { return false; } };

const TranslationTrackingStrip = ({ eventId, query, activeView, activeCadre, onPickView, onPickCadre, onAssign, onRemind, onConfig, selectedCount, reloadKey, onSummary }: Props) => {
    const [data, setData] = useState<TranslationSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [tick, setTick] = useState(0);
    const [open, setOpen] = useState<boolean>(readOpen);
    // La búsqueda cambia con cada tecla: se espera a que el usuario pare.
    const [q, setQ] = useState(query);
    useEffect(() => { const t = setTimeout(() => setQ(query), 400); return () => clearTimeout(t); }, [query]);

    useEffect(() => {
        let vivo = true;
        setLoading(true);
        dossierRequest<TranslationSummary>(`/traducciones${q ? `?${q}` : ''}`, eventId)
            .then(d => { if (!vivo) return; setData(d); setError(null); onSummary?.(d); })
            .catch((e: any) => {
                if (!vivo) return;
                if (e?.status === 401 || e?.status === 403) { setData(null); setError(null); onSummary?.(null); return; }
                setError(e?.message || 'No se pudo cargar el seguimiento de traducciones.');
            })
            .finally(() => { if (vivo) setLoading(false); });
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventId, q, reloadKey, tick]);

    const toggle = () => setOpen(o => { try { localStorage.setItem('pp-tr-open', o ? '0' : '1'); } catch { /* sin almacenamiento */ } return !o; });

    if (!data && !error) {
        return loading ? <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Calculando el seguimiento de traducciones…</div> : null;
    }
    if (error) {
        return (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <AlertTriangle size={14} /> {error}
                <button onClick={() => setTick(t => t + 1)} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold"><RefreshCw size={12} /> Reintentar</button>
            </div>
        );
    }
    const k = data!.kpis;
    const cfg = data!.config;
    const can = data!.access;
    const isCadre = can.role === 'cadre' || data!.mine > 0;
    const days = data!.daysToDeadline;
    return (
        <section aria-labelledby="seguimiento-traducciones-titulo" className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                    <h3 id="seguimiento-traducciones-titulo" className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <Languages size={16} className="text-[#17458F]" aria-hidden="true" /> Seguimiento de traducciones
                        {loading && <Loader2 size={13} className="animate-spin text-slate-400" />}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                        <span><strong className="text-emerald-700">{k.verified}</strong> de {k.applicable} verificadas</span>
                        <span className="flex min-w-[160px] flex-1 items-center gap-2 sm:max-w-xs">
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={k.verifiedPct} aria-label="Avance general de traducciones verificadas">
                                <span className="block h-full rounded-full bg-emerald-600" style={{ width: `${k.verifiedPct}%` }} />
                            </span>
                            <strong className="tabular-nums">{k.verifiedPct} %</strong>
                        </span>
                        {k.needsUpdate > 0 && <span className="font-semibold text-red-700">{k.needsUpdate} por actualizar</span>}
                        <span className="inline-flex items-center gap-1"><CalendarClock size={12} aria-hidden="true" /> Fecha límite: <strong>{cfg.deadline ? `${new Date(`${cfg.deadline}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}${days !== null ? (days < 0 ? ` (vencida hace ${-days} d)` : ` (${days} d)`) : ''}` : 'sin definir'}</strong></span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {isCadre && (
                        <button type="button" onClick={() => onPickCadre(activeCadre === 'me' ? '' : 'me')} aria-pressed={activeCadre === 'me'}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${activeCadre === 'me' ? 'border-[#17458F] bg-sky-50 text-[#17458F]' : 'border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                            Asignados a mí ({data!.mine})
                        </button>
                    )}
                    {can.manageTranslation && (
                        <button type="button" onClick={onAssign} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            title={selectedCount ? `Asignar los ${selectedCount} seleccionados` : 'Selecciona proyectos en la tabla para asignarlos'}>
                            <UserPlus size={13} aria-hidden="true" /> Asignar Cadre{selectedCount ? ` (${selectedCount})` : ''}
                        </button>
                    )}
                    {can.manageTranslation && (
                        <button type="button" onClick={onRemind} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: '#17458F' }}>
                            <Mail size={13} aria-hidden="true" /> Recordatorios a Cadres
                        </button>
                    )}
                    {can.config && (
                        <button type="button" onClick={onConfig} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                            <Settings size={13} aria-hidden="true" /> Fecha límite
                        </button>
                    )}
                    <button type="button" onClick={toggle} aria-expanded={open} aria-controls="seguimiento-traducciones-cuerpo"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                        {open ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />} {open ? 'Ocultar indicadores' : 'Ver indicadores'}
                    </button>
                </div>
            </div>
            {open && (
                <div id="seguimiento-traducciones-cuerpo">
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                        {CARDS.map(c => {
                            const active = activeView === c.view || (c.view === 'all' && (!activeView || activeView === 'all'));
                            return (
                                <button key={c.view} type="button" onClick={() => onPickView(c.view)} aria-pressed={active} title={c.hint}
                                    className={`rounded-xl border px-3 py-2 text-left transition ${active ? 'border-[#17458F] bg-sky-50 ring-1 ring-[#17458F]' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                                    <span className={`block text-xl font-extrabold tabular-nums ${c.tone}`}>{k[c.key]}</span>
                                    <span className="block text-[11px] font-semibold leading-tight text-slate-600">{c.label}</span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                        Campos traducidos: <strong>{k.translatedPct} %</strong> · revisados por una persona: <strong>{k.reviewedPct} %</strong>. Una traducción de la IA no cuenta como revisada. El estado de traducción es independiente del estado del proyecto y del pago.
                    </p>
                    {data!.workload.length > 0 && (
                        <div className="mt-3 overflow-x-auto">
                            <table className="w-full min-w-[560px] text-left text-xs">
                                <caption className="mb-1 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500">Carga de trabajo por Cadre</caption>
                                <thead className="text-[11px] text-slate-500">
                                    <tr><th className="py-1 pr-3 font-semibold">Persona</th><th className="px-2 font-semibold">Asignados</th><th className="px-2 font-semibold">Verificados</th><th className="px-2 font-semibold">Pendientes</th><th className="px-2 font-semibold">Por actualizar</th><th className="px-2 font-semibold">Revisión</th><th className="px-2 font-semibold">Última verificación</th></tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {data!.workload.map(w => (
                                        <tr key={w.email} className={activeCadre.toLowerCase() === w.email.toLowerCase() ? 'bg-sky-50' : ''}>
                                            <td className="py-1.5 pr-3">
                                                <button type="button" onClick={() => onPickCadre(activeCadre.toLowerCase() === w.email.toLowerCase() ? '' : w.email)}
                                                    className="font-semibold text-[#17458F] hover:underline" aria-label={`Ver los proyectos de ${w.name || w.email}`}>
                                                    {w.name || w.email}
                                                </button>
                                                {w.name && <span className="block text-[10px] text-slate-400">{w.email}</span>}
                                            </td>
                                            <td className="px-2 tabular-nums">{w.assigned}</td>
                                            <td className="px-2 tabular-nums text-emerald-700">{w.verified}</td>
                                            <td className="px-2 tabular-nums">{w.pending}</td>
                                            <td className={`px-2 tabular-nums ${w.needsUpdate ? 'font-semibold text-red-700' : ''}`}>{w.needsUpdate}</td>
                                            <td className="px-2 tabular-nums">{w.reviewedPct} %</td>
                                            <td className="px-2 text-slate-500">{w.lastVerifiedAt ? fmtWhen(w.lastVerifiedAt) : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </section>
    );
};

export default TranslationTrackingStrip;
