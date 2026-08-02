// ════════════════════════════════════════════════════════════════════
// Postulación de Proyectos — listado de ediciones
// v4.683.0
//
// Es la PRIMERA pantalla del módulo, y se comporta como el módulo de Eventos:
// una lista de versiones, cada una un contenedor independiente. Al abrir una,
// todo lo que se ve dentro —dashboard, postulaciones, formularios, pagos,
// alertas, reportes y convocatoria— pertenece únicamente a esa edición.
//
// Una edición ES un evento del calendario, el mismo que usa el módulo de
// inscripciones a eventos. Así "XIII Feria 2029" es UNA cosa en toda la
// plataforma —con su registro de asistentes y su convocatoria de proyectos—
// y no dos entidades paralelas que alguien tenga que mantener sincronizadas.
// ════════════════════════════════════════════════════════════════════
import { useCallback, useEffect, useState } from 'react';
import {
    AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ClipboardList,
    Loader2, Lock, MapPin, Plus, Unlink, Wallet, X,
} from 'lucide-react';
import { activeLocale } from '../../../lib/locale';

const API = (import.meta as any).env?.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });

export interface Edition {
    eventId: string | null;
    linked: boolean;
    title: string;
    slug: string | null;
    startDate: string | null;
    location: string;
    edition: { name?: string; city?: string; country?: string };
    deadline: string | null;
    enabled: boolean;
    submissions: number;
    paidSubmissions: number;
    collectedUsd: number;
    updatedAt: string | null;
}

interface AvailableEvent { id: string; title: string; slug: string | null; startDate: string | null; location: string | null }

const fmtDate = (v?: string | null) => {
    if (!v) return 'Sin fecha';
    const d = new Date(v);
    return isNaN(d.getTime()) ? 'Sin fecha' : d.toLocaleDateString(activeLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
};
const fmtUsd = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const EdicionesList = ({ onOpen }: { onOpen: (eventId: string) => void }) => {
    const [editions, setEditions] = useState<Edition[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [available, setAvailable] = useState<AvailableEvent[] | null>(null);
    const [chosen, setChosen] = useState('');
    const [from, setFrom] = useState('');
    const [busy, setBusy] = useState(false);
    // Vinculación a mano: es la salida cuando la migración automática no pudo
    // identificar la edición sola. Sin esto, una convocatoria sin vincular era
    // un callejón sin salida — se veía, pero no se podía abrir ni arreglar.
    const [linking, setLinking] = useState(false);

    const load = useCallback(() => {
        setError(null);
        fetch(`${API}/project-fair/admin/ediciones`, { headers: authHeaders() })
            .then(async r => {
                const body = await r.json();
                if (!r.ok) throw new Error(body?.error || 'No pudimos cargar las ediciones.');
                return body;
            })
            .then(body => setEditions(body.editions || []))
            .catch(e => { setEditions([]); setError(e?.message || 'No pudimos cargar las ediciones.'); });
    }, []);

    useEffect(load, [load]);

    const openCreator = () => {
        setCreating(true);
        setChosen(''); setFrom(editions?.[0]?.eventId || '');
        fetch(`${API}/project-fair/admin/ediciones/disponibles`, { headers: authHeaders() })
            .then(r => r.json())
            .then(body => setAvailable(body.events || []))
            .catch(() => setAvailable([]));
    };

    const openLinker = () => {
        setLinking(true); setChosen(''); setError(null);
        fetch(`${API}/project-fair/admin/ediciones/disponibles`, { headers: authHeaders() })
            .then(r => r.json())
            .then(body => setAvailable(body.events || []))
            .catch(() => setAvailable([]));
    };

    const link = async () => {
        if (!chosen) return;
        setBusy(true); setError(null);
        try {
            const res = await fetch(`${API}/project-fair/admin/ediciones/vincular`, {
                method: 'PUT',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId: chosen }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error || 'No pudimos vincular la edición.');
            setEditions(body.editions || []);
            setLinking(false);
        } catch (e: any) {
            setError(e?.message || 'No pudimos vincular la edición.');
        } finally {
            setBusy(false);
        }
    };

    const create = async () => {
        if (!chosen) return;
        setBusy(true); setError(null);
        try {
            const res = await fetch(`${API}/project-fair/admin/ediciones`, {
                method: 'POST',
                headers: { ...authHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ eventId: chosen, from: from || undefined }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error || 'No pudimos crear la edición.');
            setEditions(body.editions || []);
            setCreating(false);
        } catch (e: any) {
            setError(e?.message || 'No pudimos crear la edición.');
        } finally {
            setBusy(false);
        }
    };

    if (!editions) {
        return (
            <div className="flex h-64 items-center justify-center text-gray-500">
                <Loader2 className="mr-2 animate-spin" size={20} /> Cargando ediciones…
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100">
                        <ClipboardList className="h-6 w-6 text-rotary-blue" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Postulación de Proyectos</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Una versión por edición de la feria · {editions.length} {editions.length === 1 ? 'edición registrada' : 'ediciones registradas'}
                        </p>
                    </div>
                </div>
                <button
                    onClick={openCreator}
                    className="flex items-center gap-2 rounded-xl bg-rotary-blue px-5 py-2.5 font-bold text-white shadow-xl shadow-blue-900/20 transition-all hover:bg-sky-800 active:scale-95"
                ><Plus className="h-5 w-5" /> Nueva Versión</button>
            </div>

            {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" /> <span>{error}</span>
                </div>
            )}

            {!editions.length && !error && (
                <div className="rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center">
                    <p className="font-semibold text-slate-700">Todavía no hay ninguna edición.</p>
                    <p className="mt-1 text-sm text-slate-500">
                        Crea la primera desde «Nueva Versión», eligiendo el evento del calendario al que corresponde.
                    </p>
                </div>
            )}

            <div className="space-y-3">
                {editions.map(ed => (
                    <div
                        key={ed.eventId || ed.title}
                        role={ed.eventId ? 'button' : undefined}
                        tabIndex={ed.eventId ? 0 : undefined}
                        onClick={() => ed.eventId && onOpen(ed.eventId)}
                        onKeyDown={e => { if (ed.eventId && (e.key === 'Enter' || e.key === ' ')) onOpen(ed.eventId); }}
                        className={`flex w-full flex-wrap items-center justify-between gap-4 rounded-xl border bg-white px-5 py-4 text-left transition ${
                            ed.eventId
                                ? 'cursor-pointer border-gray-200 hover:border-sky-300 hover:shadow-sm'
                                : 'border-amber-300'}`}
                    >
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[15px] font-bold text-slate-900">{ed.title}</span>
                                {ed.enabled ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                                        <CheckCircle2 size={11} /> Convocatoria abierta
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                                        <Lock size={11} /> Cerrada
                                    </span>
                                )}
                                {/* Una convocatoria sin evento del calendario se puede
                                    leer, pero no se abre: primero hay que decirle a qué
                                    edición pertenece. Se dice en vez de esconderla. */}
                                {!ed.linked && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                                        <Unlink size={11} /> Sin evento vinculado
                                    </span>
                                )}
                            </div>
                            {!ed.linked && (
                                <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-amber-800">
                                    Sus {ed.submissions} postulación(es) están a salvo, pero para abrirla hay que decir
                                    a qué evento del calendario corresponde. Al vincularla, sus postulaciones,
                                    pagos y etiquetas quedan dentro de esa edición.
                                </p>
                            )}
                            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-500">
                                <span className="inline-flex items-center gap-1"><CalendarDays size={13} /> {fmtDate(ed.startDate)}</span>
                                {ed.location && <span className="inline-flex items-center gap-1"><MapPin size={13} /> {ed.location}</span>}
                                {ed.deadline && <span>Cierre de postulaciones: {fmtDate(ed.deadline)}</span>}
                            </p>
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="text-right">
                                <p className="text-lg font-bold text-slate-900">{ed.submissions}</p>
                                <p className="text-[11px] uppercase tracking-wide text-slate-400">Postulaciones</p>
                            </div>
                            <div className="text-right">
                                <p className="inline-flex items-center gap-1 text-lg font-bold text-slate-900">
                                    <Wallet size={15} className="text-slate-400" /> {fmtUsd(ed.collectedUsd)}
                                </p>
                                <p className="text-[11px] uppercase tracking-wide text-slate-400">{ed.paidSubmissions} pagadas</p>
                            </div>
                            {ed.eventId
                                ? <ArrowRight size={18} className="text-slate-400" />
                                : (
                                    <button
                                        onClick={e => { e.stopPropagation(); openLinker(); }}
                                        className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-600"
                                    >Vincular evento</button>
                                )}
                        </div>
                    </div>
                ))}
            </div>

            {linking && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-2xl">
                        <div className="mb-1 flex items-start justify-between">
                            <h2 className="text-xl font-bold text-slate-900">Vincular la edición</h2>
                            <button onClick={() => setLinking(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>
                        <p className="mb-5 text-sm text-slate-500">
                            Elige el evento del calendario al que corresponde esta convocatoria. Sus
                            postulaciones, pagos y etiquetas pasarán a formar parte de esa edición.
                            <strong> No se crea ni se borra nada</strong>: sólo se dice a cuál pertenecen.
                        </p>

                        <label className="mb-6 block">
                            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Evento del calendario</span>
                            <select
                                value={chosen} onChange={e => setChosen(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                            >
                                <option value="">- Elige el evento -</option>
                                {(available || []).map(e => (
                                    <option key={e.id} value={e.id}>{e.title}{e.startDate ? ` · ${fmtDate(e.startDate)}` : ''}</option>
                                ))}
                            </select>
                            {available && !available.length && (
                                <span className="mt-1.5 block text-[13px] text-amber-700">
                                    No hay eventos disponibles en el calendario. Crea el evento de esta edición
                                    en el módulo de Eventos y vuelve aquí.
                                </span>
                            )}
                        </label>

                        <div className="flex justify-end gap-2">
                            <button onClick={() => setLinking(false)} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
                            <button
                                onClick={link} disabled={!chosen || busy}
                                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-50"
                            >{busy && <Loader2 size={15} className="animate-spin" />} Vincular</button>
                        </div>
                    </div>
                </div>
            )}

            {creating && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-2xl">
                        <div className="mb-1 flex items-start justify-between">
                            <h2 className="text-xl font-bold text-slate-900">Nueva versión</h2>
                            <button onClick={() => setCreating(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>
                        <p className="mb-5 text-sm text-slate-500">
                            La edición nueva hereda la estructura de otra —precios, textos, distritos, áreas de
                            enfoque, tipos de documento, cargos y la plantilla del formulario— para no
                            reconstruirla desde cero. <strong>No hereda los datos</strong>: las postulaciones, los
                            pagos y los formularios diligenciados se quedan en su edición.
                        </p>

                        <label className="mb-4 block">
                            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Evento del calendario</span>
                            <select
                                value={chosen} onChange={e => setChosen(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                            >
                                <option value="">- Elige el evento -</option>
                                {(available || []).map(e => (
                                    <option key={e.id} value={e.id}>{e.title}{e.startDate ? ` · ${fmtDate(e.startDate)}` : ''}</option>
                                ))}
                            </select>
                            {available && !available.length && (
                                <span className="mt-1.5 block text-[13px] text-amber-700">
                                    Todos los eventos del calendario ya tienen convocatoria. Crea primero el evento
                                    de la nueva edición en el módulo de Eventos.
                                </span>
                            )}
                        </label>

                        <label className="mb-6 block">
                            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Copiar la configuración de</span>
                            <select
                                value={from} onChange={e => setFrom(e.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none"
                            >
                                {editions.filter(e => e.eventId).map(e => (
                                    <option key={e.eventId!} value={e.eventId!}>{e.title}</option>
                                ))}
                            </select>
                        </label>

                        <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2.5 text-[13px] text-slate-600">
                            Nace <strong>cerrada al público</strong>. Abrirla es una decisión aparte, desde su
                            pestaña Convocatoria.
                        </p>

                        <div className="flex justify-end gap-2">
                            <button onClick={() => setCreating(false)} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
                            <button
                                onClick={create} disabled={!chosen || busy}
                                className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-800 disabled:opacity-50"
                            >{busy && <Loader2 size={15} className="animate-spin" />} Crear versión</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default EdicionesList;
