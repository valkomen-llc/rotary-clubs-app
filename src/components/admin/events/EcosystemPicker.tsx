// ════════════════════════════════════════════════════════════════════
// Traer eventos del ecosistema del distrito — v4.747
//
// Un solo campo resuelve las dos preguntas del pedido —qué organización y qué
// evento—, porque en la práctica quien busca ya sabe cuál de las dos tiene en
// la cabeza. El desplegable de organizaciones queda como filtro, no como paso
// obligatorio: obligar a elegir sitio primero añade un clic a todos para
// ayudar a unos pocos.
//
// TODOS LOS HOOKS VAN ARRIBA, antes de cualquier `return`. Es la regla de
// v4.689: React identifica cada hook por su ORDEN de llamada, así que un hook
// escrito debajo de un return temprano no se ejecuta en el primer render y sí
// en el segundo — y el árbol entero se cae, con la pantalla en blanco. El
// typecheck no lo ve; lo ve `npm run check:hooks`.
// ════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    X, Search, Loader2, Check, CalendarDays, RefreshCw,
    ExternalLink, Building2, AlertTriangle, Inbox,
} from 'lucide-react';
import { divergenceMessage, type Divergence, type OrgBadge } from '../../../lib/districtEcosystem';

interface EcosystemEvent {
    id: string;
    title: string;
    startDate: string;
    endDate?: string | null;
    location: string;
    type: string;
    image: string;
    url: string;
    org: { id: string; name: string; city: string; logo: string; badge: OrgBadge };
    cloneId: string | null;
    divergence: Divergence | null;
}

interface EcosystemSite {
    id: string;
    name: string;
    city: string;
    logo: string;
    badge: OrgBadge;
    upcoming: number;
}

interface Props {
    /** Se llama tras traer eventos, para que el panel recargue su lista. */
    onDone: () => void;
    onClose: () => void;
}

const fmtDate = (value: string) => {
    if (!value) return '';
    return new Date(value).toLocaleDateString('es-ES', {
        weekday: 'short', day: 'numeric', month: 'short',
    });
};
const fmtTime = (value: string) => {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
};

const EcosystemPicker: React.FC<Props> = ({ onDone, onClose }) => {
    const [sites, setSites] = useState<EcosystemSite[]>([]);
    const [events, setEvents] = useState<EcosystemEvent[]>([]);
    const [districtName, setDistrictName] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [siteFilter, setSiteFilter] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [working, setWorking] = useState(false);
    const [refreshing, setRefreshing] = useState<string | null>(null);
    const [result, setResult] = useState<{ created: number; skipped: string[] } | null>(null);

    const API = import.meta.env.VITE_API_URL || '/api';

    const headers = useMemo(() => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
    }), []);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [sitesRes, eventsRes] = await Promise.all([
                fetch(`${API}/district-ecosystem/sites`, { headers }),
                fetch(`${API}/district-ecosystem/events`, { headers }),
            ]);
            const sitesData = await sitesRes.json();
            const eventsData = await eventsRes.json();

            if (!sitesRes.ok) throw new Error(sitesData?.error || 'No pudimos cargar tu ecosistema.');
            if (!eventsRes.ok) throw new Error(eventsData?.error || 'No pudimos cargar los eventos.');

            // `?.` en CADA eslabón: una respuesta sin `sites` —una versión
            // anterior de la API, un error devuelto como objeto— revienta el
            // render y eso es el panel EN BLANCO, no un aviso (v4.720.1).
            setSites(Array.isArray(sitesData?.sites) ? sitesData.sites : []);
            setEvents(Array.isArray(eventsData?.events) ? eventsData.events : []);
            setDistrictName(sitesData?.district?.name || '');
        } catch (e: any) {
            setError(e?.message || 'No pudimos cargar tu ecosistema.');
        } finally {
            setLoading(false);
        }
    }, [API, headers]);

    useEffect(() => { load(); }, [load]);

    // El filtrado es local: los eventos próximos del ecosistema ya vinieron
    // todos. Consultar al servidor por cada tecla sería una petición por
    // pulsación para reordenar una lista que está en memoria.
    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return events.filter((e) => {
            if (siteFilter && e.org.id !== siteFilter) return false;
            if (!q) return true;
            return `${e.title} ${e.location} ${e.org.name} ${e.org.city}`.toLowerCase().includes(q);
        });
    }, [events, query, siteFilter]);

    const selectable = useMemo(() => visible.filter((e) => !e.cloneId), [visible]);

    const toggle = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        setSelected((prev) =>
            prev.size === selectable.length ? new Set() : new Set(selectable.map((e) => e.id)));
    };

    const bringSelected = async () => {
        if (!selected.size) return;
        setWorking(true);
        setError('');
        try {
            const res = await fetch(`${API}/district-ecosystem/clone`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ eventIds: [...selected] }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'No pudimos traer los eventos.');

            setResult({
                created: (data?.created || []).length,
                skipped: (data?.skipped || []).map((s: any) => `${s.title || 'Un evento'}: ${s.reason}`),
            });
            setSelected(new Set());
            await load();
            onDone();
        } catch (e: any) {
            setError(e?.message || 'No pudimos traer los eventos.');
        } finally {
            setWorking(false);
        }
    };

    const refreshOne = async (cloneId: string) => {
        setRefreshing(cloneId);
        setError('');
        try {
            const res = await fetch(`${API}/district-ecosystem/refresh/${cloneId}`, {
                method: 'POST', headers,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data?.error || 'No pudimos actualizar el evento.');
            await load();
            onDone();
        } catch (e: any) {
            setError(e?.message || 'No pudimos actualizar el evento.');
        } finally {
            setRefreshing(null);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8 overflow-hidden">

                {/* ── Cabecera ────────────────────────────────────── */}
                <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-gray-200">
                    <div className="min-w-0">
                        <h3 className="text-lg font-bold text-gray-900">Traer del ecosistema</h3>
                        <p className="text-sm text-gray-500 mt-0.5">
                            Eventos próximos de los sitios vinculados
                            {districtName ? ` a ${districtName}` : ' a tu distrito'}. Se copian a tu
                            agenda acreditando y enlazando al sitio de origen.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Cerrar"
                        className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* ── Buscador y filtro ───────────────────────────── */}
                <div className="px-6 py-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Buscar por evento, organización o ciudad…"
                            className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <select
                        value={siteFilter}
                        onChange={(e) => setSiteFilter(e.target.value)}
                        className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none sm:max-w-[15rem]"
                    >
                        <option value="">Todas las organizaciones</option>
                        {sites.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name} ({s.upcoming})
                            </option>
                        ))}
                    </select>
                </div>

                {/* ── Avisos ──────────────────────────────────────── */}
                {error && (
                    <div className="mx-6 mt-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}
                {result && (
                    <div className="mx-6 mt-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-lg px-4 py-3 text-sm">
                        <p className="font-semibold">
                            {result.created === 0
                                ? 'No se trajo ningún evento nuevo.'
                                : `Se ${result.created === 1 ? 'trajo 1 evento' : `trajeron ${result.created} eventos`} a tu agenda.`}
                        </p>
                        {result.skipped.length > 0 && (
                            <ul className="mt-1.5 list-disc pl-5 text-emerald-800/80">
                                {result.skipped.map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                        )}
                    </div>
                )}

                {/* ── Lista ───────────────────────────────────────── */}
                <div className="max-h-[26rem] overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-gray-400">
                            <Loader2 className="w-6 h-6 animate-spin" />
                        </div>
                    ) : visible.length === 0 ? (
                        <div className="text-center py-14 px-6">
                            <Inbox className="w-10 h-10 mx-auto text-gray-300" />
                            <p className="mt-3 font-semibold text-gray-700">
                                {events.length === 0
                                    ? 'Ninguna organización de tu distrito tiene eventos próximos.'
                                    : 'Ningún evento coincide con la búsqueda.'}
                            </p>
                            <p className="mt-1 text-sm text-gray-500 max-w-md mx-auto">
                                {events.length === 0
                                    ? sites.length === 0
                                        ? 'Todavía no hay sitios vinculados a tu distrito. Los vincula el operador de la plataforma desde el panel de Distritos.'
                                        : `Se revisaron ${sites.length} sitios vinculados. Aparecerán acá en cuanto publiquen un evento con fecha futura.`
                                    : 'Probá con otro término o quitá el filtro de organización.'}
                            </p>
                        </div>
                    ) : (
                        <>
                            {selectable.length > 0 && (
                                <div className="flex items-center justify-between px-6 py-2.5 bg-gray-50 border-b border-gray-100 sticky top-0">
                                    <button
                                        onClick={toggleAll}
                                        className="text-xs font-semibold text-rotary-blue hover:underline"
                                    >
                                        {selected.size === selectable.length ? 'Quitar la selección' : `Seleccionar los ${selectable.length} disponibles`}
                                    </button>
                                    <span className="text-xs text-gray-500 tabular-nums">
                                        {visible.length} evento{visible.length === 1 ? '' : 's'}
                                    </span>
                                </div>
                            )}

                            <ul className="divide-y divide-gray-100">
                                {visible.map((ev) => {
                                    const already = !!ev.cloneId;
                                    const diverged = ev.divergence
                                        ? divergenceMessage(ev.divergence)
                                        : '';
                                    return (
                                        <li
                                            key={ev.id}
                                            className={`px-6 py-3.5 flex items-start gap-3 ${already ? 'bg-gray-50/60' : 'hover:bg-blue-50/40'}`}
                                        >
                                            {already ? (
                                                <span
                                                    className="mt-1 w-4 h-4 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"
                                                    title="Ya está en tu agenda"
                                                >
                                                    <Check className="w-3 h-3" />
                                                </span>
                                            ) : (
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(ev.id)}
                                                    onChange={() => toggle(ev.id)}
                                                    aria-label={`Traer: ${ev.title}`}
                                                    className="mt-1 w-4 h-4 rounded border-gray-300 text-rotary-blue focus:ring-blue-500 shrink-0"
                                                />
                                            )}

                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span
                                                        className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border border-gray-200 bg-white text-gray-600"
                                                    >
                                                        {/* El color va en línea, no como clase: Tailwind
                                                            no genera lo que no puede leer (v4.719). */}
                                                        <span
                                                            className="w-1.5 h-1.5 rounded-full"
                                                            style={{ background: ev.org.badge.color }}
                                                        />
                                                        {ev.org.badge.label}
                                                    </span>
                                                    <span className="text-xs text-gray-500 truncate">{ev.org.name}</span>
                                                </div>

                                                <p className="font-semibold text-gray-900 text-sm mt-1 leading-snug">
                                                    {ev.title}
                                                </p>

                                                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                                    <span className="inline-flex items-center gap-1">
                                                        <CalendarDays className="w-3 h-3" />
                                                        {fmtDate(ev.startDate)} · {fmtTime(ev.startDate)}
                                                    </span>
                                                    {ev.location && (
                                                        <span className="inline-flex items-center gap-1 truncate">
                                                            <Building2 className="w-3 h-3" /> {ev.location}
                                                        </span>
                                                    )}
                                                </p>

                                                {already && (
                                                    <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                                                        <span className="text-xs text-emerald-700 font-medium">
                                                            Ya está en tu agenda
                                                        </span>
                                                        {diverged && (
                                                            <>
                                                                <span className="text-xs text-amber-700">{diverged}</span>
                                                                <button
                                                                    onClick={() => refreshOne(ev.cloneId!)}
                                                                    disabled={refreshing === ev.cloneId}
                                                                    className="inline-flex items-center gap-1 text-xs font-semibold text-rotary-blue hover:underline disabled:opacity-50"
                                                                >
                                                                    {refreshing === ev.cloneId
                                                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                                                        : <RefreshCw className="w-3 h-3" />}
                                                                    Actualizar desde el origen
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            {ev.url && (
                                                <a
                                                    href={ev.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title="Ver el evento en el sitio de origen"
                                                    className="p-1.5 rounded-lg text-gray-400 hover:text-rotary-blue hover:bg-white shrink-0"
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                </a>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}
                </div>

                {/* ── Pie ─────────────────────────────────────────── */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-500">
                        El evento se copia a tu sitio. La inscripción, si la tiene, sigue en el sitio
                        de origen.
                    </p>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                        >
                            Cerrar
                        </button>
                        <button
                            onClick={bringSelected}
                            disabled={!selected.size || working}
                            className="inline-flex items-center gap-2 bg-rotary-blue text-white px-5 py-2 rounded-lg text-sm font-bold hover:bg-rotary-navy transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            {working && <Loader2 className="w-4 h-4 animate-spin" />}
                            {selected.size
                                ? `Traer ${selected.size} evento${selected.size === 1 ? '' : 's'}`
                                : 'Traer a mi agenda'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EcosystemPicker;
