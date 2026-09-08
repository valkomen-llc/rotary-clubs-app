// ════════════════════════════════════════════════════════════════════════════
// Solicitudes de contenido — la BANDEJA (v4.999)
//
// La pantalla que faltaba. Hasta v4.998 «Solicitudes de contenido» era un
// número en una tarjeta y la única forma de mirarlas era abrir el editor de
// UNA campaña, desplegar una sección y ser el operador de la plataforma: un
// sitio veía «15 solicitudes» de una campaña que él publica y al pulsar no
// pasaba nada.
//
// ⚠️ NO ES UNA SEGUNDA BANDEJA. La sección dentro del editor de la campaña se
// conserva —ahí está el enlace para compartir y la configuración del
// formulario, que son de la campaña— y su listado y su ficha son los MISMOS
// componentes y los MISMOS endpoints. Lo que esta pantalla agrega es la
// pregunta transversal: «qué solicitudes tengo, de todas mis campañas».
//
// ⚠️ EL ALCANCE LO RESUELVE EL SERVIDOR Y VIAJA RESUELTO. Acá no se decide
// quién ve qué: se pide `/submissions/inbox` y se pinta lo que vuelve. Con el
// filtro implementado también acá, lo que se ve y lo que se puede operar
// podrían discrepar — y lo que discreparía es el aislamiento entre
// organizaciones (regla del panel de grupos, v4.876, y del calendario de la
// distribución, v4.864).
// ════════════════════════════════════════════════════════════════════════════

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AdminLayout from '../../components/admin/AdminLayout';
import SubmissionDetail from '../../components/admin/contribution/SubmissionDetail';
import {
    Inbox, Search, RefreshCw, ArrowLeft, AlertTriangle, Filter, X,
    Image as ImageIcon, Film, Library, Users, Globe, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { stateChip, stateLabel, activityDateLabel } from '../../lib/contentSubmissionSpec';
import { articleBadge } from '../../lib/submissionArticleSpec';
import {
    CONTENT_KINDS, UNASSIGNED, type InboxQuery,
    hasFilters, toSearchParams, fromSearchParams, describeInboxView, isPending,
} from '../../lib/submissionInbox';

const API = import.meta.env.VITE_API_URL || '/api';
const token = () => localStorage.getItem('rotary_token');

interface Fila {
    id: string; campaignId: string; campaignName?: string;
    status: string; assignee?: string | null;
    senderName: string; senderEmail: string; senderPhone?: string | null;
    club?: string | null; district?: string | null; city?: string | null;
    title?: string | null; description?: string | null;
    activityDate?: string | null; createdAt: string;
    originClubId?: string | null; originClubName?: string | null;
    imageCount: number; videoCount: number; promotedCount: number;
    // El artículo generado desde la solicitud (v4.1000). `null` = no generado.
    article?: { id: string; status: string; postId?: string | null; publicUrl?: string | null } | null;
}
interface Facets {
    campanas: { id: string; label: string }[];
    sitios: { id: string; label: string }[];
    distritos: string[];
    responsables: string[];
}
interface Respuesta {
    scope: 'platform' | 'site'; siteScoped: boolean;
    submissions: Fila[]; total: number; page: number; perPage: number;
    resumen: { total: number; pendientes: number; abiertas: number; porEstado: Record<string, number> };
    tabs: { id: string; label: string; n: number; pending: boolean }[];
    facets: Facets;
    filtrada: boolean;
    descartados: { campo: string; motivo: string }[];
}

const fmtFecha = (v?: string) => v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtHora = (v?: string) => v ? new Date(v).toLocaleString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

const campo = 'w-full px-3 py-2 rounded-xl border-2 border-gray-100 focus:border-rotary-blue outline-none text-sm bg-white min-w-0';
const rotulo = 'block text-[10px] font-black text-gray-400 uppercase tracking-[0.12em] mb-1';

const SubmissionsInbox: React.FC = () => {
    const [params, setParams] = useSearchParams();
    // La dirección es la fuente de verdad del filtro: recargar no lo pierde y
    // el enlace se puede compartir ya filtrado.
    const q = useMemo<InboxQuery>(() => fromSearchParams(params), [params]);

    const [data, setData] = useState<Respuesta | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [abierta, setAbierta] = useState<{ id: string; campaignId: string } | null>(null);
    const [busqueda, setBusqueda] = useState(q.q);
    const [verFiltros, setVerFiltros] = useState(false);

    const aplicar = useCallback((patch: Partial<InboxQuery>) => {
        // Cambiar un filtro vuelve a la página 1: quedarse en la 3 de un
        // listado que ahora tiene una página se ve como un vacío.
        const siguiente = { ...q, ...patch, page: patch.page ?? 1 };
        setParams(toSearchParams(siguiente), { replace: true });
    }, [q, setParams]);

    const cargar = useCallback(async () => {
        setCargando(true); setError(null);
        try {
            const r = await fetch(`${API}/contribution-campaigns/submissions/inbox?${toSearchParams(q)}`, {
                headers: { Authorization: `Bearer ${token()}` },
            });
            // Ninguna respuesta se lee con `.json()` a ciegas: una página de
            // error HTML rompe el parseo y el error resultante no nombra
            // ninguna capa (la lección de v4.946).
            const texto = await r.text();
            let json: any;
            try { json = JSON.parse(texto); } catch {
                throw new Error(`El servidor respondió ${r.status} con ${r.headers.get('content-type') || 'contenido desconocido'} en vez de JSON.`);
            }
            if (!r.ok) {
                // Cada fallo con su causa: 401 se corrige volviendo a entrar,
                // 403 pidiendo el permiso, 404 es una campaña que no alcanza.
                if (r.status === 401) throw new Error('Tu sesión venció. Volvé a entrar y la bandeja carga de nuevo.');
                if (r.status === 403) throw new Error('Tu usuario no tiene permiso para ver las solicitudes de contenido.');
                if (r.status === 404) throw new Error('Esa campaña no existe o no llega a tu sitio.');
                throw new Error(json?.error || `El servidor respondió ${r.status}.`);
            }
            setData(json);
            // Lo que el servidor descartó del filtro se DICE: un filtro que no
            // se aplica ensancha lo que se ve, y eso no puede pasar en silencio.
            for (const d of json.descartados || []) toast.warning(`Filtro ignorado — ${d.motivo}`);
        } catch (e: any) {
            setError(e?.message || 'No se pudieron cargar las solicitudes.');
        } finally { setCargando(false); }
    }, [q]);

    useEffect(() => { cargar(); }, [cargar]);
    useEffect(() => { setBusqueda(q.q); }, [q.q]);

    // `?abrir=<id>` abre la ficha directamente (v4.1000): es lo que enlazan
    // «Ver solicitud original» desde Noticias y el aviso de borradores. La
    // ficha necesita el `campaignId` y la dirección no lo trae, así que se le
    // pregunta al servidor —que además comprueba el alcance— y se retira el
    // parámetro para que cerrar la ficha no la vuelva a abrir al recargar.
    const abrirParam = params.get('abrir');
    useEffect(() => {
        if (!abrirParam) return;
        let vivo = true;
        (async () => {
            try {
                const r = await fetch(`${API}/contribution-campaigns/submissions/inbox/${encodeURIComponent(abrirParam)}`, {
                    headers: { Authorization: `Bearer ${token()}` },
                });
                const texto = await r.text();
                let json: any = null;
                try { json = JSON.parse(texto); } catch { json = null; }
                if (!vivo) return;
                if (!r.ok || !json?.campaignId) {
                    toast.error(r.status === 404 ? 'Esa solicitud no existe o no llega a tu sitio.' : (json?.error || 'No se pudo abrir la solicitud.'));
                } else {
                    setAbierta({ id: abrirParam, campaignId: json.campaignId });
                }
            } catch {
                if (vivo) toast.error('No se pudo abrir la solicitud.');
            } finally {
                if (vivo) {
                    const siguiente = new URLSearchParams(params);
                    siguiente.delete('abrir');
                    setParams(siguiente, { replace: true });
                }
            }
        })();
        return () => { vivo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [abrirParam]);

    const facets = data?.facets || { campanas: [], sitios: [], distritos: [], responsables: [] };
    const filtrada = hasFilters(q);
    const totalPaginas = data ? Math.max(1, Math.ceil(data.total / (data.perPage || 50))) : 1;

    const limpiar = () => setParams(new URLSearchParams(), { replace: true });

    return (
        // ⚠️ A ANCHO COMPLETO, Y EL TOPE QUE SOBRABA NO ERA EL DE ESTA PANTALLA
        // (v4.1005). Acá había un `max-w-[1600px] mx-auto` que NUNCA llegaba a
        // actuar: el envoltorio de `AdminLayout` ya acota el panel entero a
        // `max-w-7xl` (1280 px) y le suma 40 px de relleno por lado, y esta
        // pantalla agregaba otros 32 encima. El resultado son los bordes que se
        // reportaron —72 px de aire a cada lado de una tabla de seis columnas
        // que además desborda—. Corregir el tope de acá habría sido corregir lo
        // que no estaba actuando.
        //
        // La bandeja es una TABLA ANCHA: cada píxel de gutter es una columna
        // menos a la vista. `wide` es aditivo y no cambia ninguna otra pantalla,
        // y el relleno lo pone ahora el propio envoltorio — ponerlo también acá
        // volvería a sumarlos.
        <AdminLayout wide>
            <div className="space-y-5">

                {/* ── Cabecera ────────────────────────────────────────── */}
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <Link to="/admin/campanas-contribucion"
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-gray-600 mb-2">
                            <ArrowLeft className="w-3.5 h-3.5" /> Campañas de Contribución
                        </Link>
                        <h1 className="text-2xl sm:text-3xl font-light text-gray-800 flex items-center gap-3">
                            <span className="w-11 h-11 rounded-2xl bg-sky-50 flex items-center justify-center shrink-0">
                                <Inbox className="w-5 h-5 text-sky-500" />
                            </span>
                            Solicitudes de contenido
                        </h1>
                        <p className="text-sm text-gray-500 mt-1.5 max-w-2xl">
                            El material que los clubes mandan por el formulario de cada campaña. Acá se revisa,
                            se aprueba y se convierte en publicaciones.
                            {data?.siteScoped && ' Ves las de las campañas que tu sitio publica.'}
                        </p>
                    </div>
                    <button onClick={cargar} disabled={cargando}
                        className="px-4 py-2.5 rounded-xl border-2 border-gray-100 hover:border-gray-200 text-xs font-black text-gray-500 flex items-center gap-2 disabled:opacity-50">
                        <RefreshCw className={`w-4 h-4 ${cargando ? 'animate-spin' : ''}`} /> ACTUALIZAR
                    </button>
                </div>

                {error && (
                    <div className="rounded-2xl bg-red-50 border border-red-100 p-4 flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-bold text-red-900">No se pudieron cargar las solicitudes</p>
                            <p className="text-xs text-red-700 mt-0.5">{error}</p>
                            <button onClick={cargar} className="mt-2 text-xs font-black text-red-700 underline">Reintentar</button>
                        </div>
                    </div>
                )}

                {/* ── Pestañas de estado ──────────────────────────────────
                    Doblan como filtro: es el gesto natural sobre un contador.
                    Los números salen del servidor y NO del filtro de estado,
                    así que siguen diciendo cuántas hay en cada uno mientras se
                    mira una sola. */}
                {data && (
                    <div className="flex flex-wrap gap-2">
                        <button onClick={() => aplicar({ status: '' })}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black border-2 transition ${
                                !q.status ? 'border-rotary-blue bg-rotary-blue/5 text-rotary-blue' : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}>
                            TODAS <span className="ml-1 text-gray-400">{data.resumen.total}</span>
                        </button>
                        {data.tabs.filter(t => t.n > 0 || t.id === q.status).map(t => (
                            <button key={t.id} onClick={() => aplicar({ status: q.status === t.id ? '' : t.id })}
                                className={`px-3.5 py-2 rounded-xl text-xs font-black border-2 transition ${
                                    q.status === t.id ? 'border-rotary-blue bg-rotary-blue/5 text-rotary-blue'
                                        : t.pending && t.n > 0 ? 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300'
                                            : 'border-gray-100 text-gray-500 hover:border-gray-200'}`}>
                                {t.label.toUpperCase()} <span className="ml-1 opacity-60">{t.n}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* ── Búsqueda y filtros ─────────────────────────────────── */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
                    <div className="flex flex-wrap gap-2 items-center">
                        <form className="relative flex-1 min-w-[200px]"
                            onSubmit={e => { e.preventDefault(); aplicar({ q: busqueda }); }}>
                            <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                                placeholder="Buscar por nombre, correo, club, campaña o texto de la solicitud…"
                                className={`${campo} pl-9`} />
                        </form>
                        <button type="button" onClick={() => setVerFiltros(v => !v)}
                            className={`px-4 py-2 rounded-xl text-xs font-black border-2 flex items-center gap-2 shrink-0 ${
                                verFiltros || filtrada ? 'border-rotary-blue text-rotary-blue' : 'border-gray-100 text-gray-500'}`}>
                            <Filter className="w-4 h-4" /> FILTROS
                        </button>
                        {filtrada && (
                            <button type="button" onClick={limpiar}
                                className="px-4 py-2 rounded-xl text-xs font-black text-gray-500 border-2 border-gray-100 hover:border-gray-200 flex items-center gap-2 shrink-0">
                                <X className="w-4 h-4" /> QUITAR FILTROS
                            </button>
                        )}
                    </div>

                    {verFiltros && (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
                            <div className="min-w-0">
                                <label className={rotulo}>Campaña</label>
                                <select className={campo} value={q.campaign} onChange={e => aplicar({ campaign: e.target.value })}>
                                    <option value="">Todas</option>
                                    {facets.campanas.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            </div>
                            {/* El sitio de ORIGEN sólo se ofrece si alguna solicitud lo
                                declara: es aditivo desde v4.999 y las anteriores no lo
                                tienen. Un desplegable con una sola opción vacía sería un
                                control que no controla nada (v4.650). */}
                            {facets.sitios.length > 0 && (
                                <div className="min-w-0">
                                    <label className={rotulo}>Sitio de origen</label>
                                    <select className={campo} value={q.site} onChange={e => aplicar({ site: e.target.value })}>
                                        <option value="">Todos</option>
                                        {facets.sitios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="min-w-0">
                                <label className={rotulo}>Distrito</label>
                                <select className={campo} value={q.district} onChange={e => aplicar({ district: e.target.value })}>
                                    <option value="">Todos</option>
                                    {facets.distritos.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>
                            <div className="min-w-0">
                                <label className={rotulo}>Responsable</label>
                                <select className={campo} value={q.assignee} onChange={e => aplicar({ assignee: e.target.value })}>
                                    <option value="">Cualquiera</option>
                                    <option value={UNASSIGNED}>Sin asignar</option>
                                    {facets.responsables.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>
                            <div className="min-w-0">
                                <label className={rotulo}>Tipo de contenido</label>
                                <select className={campo} value={q.kind} onChange={e => aplicar({ kind: e.target.value })}>
                                    <option value="">Cualquiera</option>
                                    {Object.values(CONTENT_KINDS).map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                                </select>
                            </div>
                            <div className="min-w-0">
                                <label className={rotulo}>Desde</label>
                                <input type="date" className={campo} value={q.from} onChange={e => aplicar({ from: e.target.value })} />
                            </div>
                            <div className="min-w-0">
                                <label className={rotulo}>Hasta</label>
                                <input type="date" className={campo} value={q.to} onChange={e => aplicar({ to: e.target.value })} />
                            </div>
                        </div>
                    )}

                    {data && (
                        <p className="text-[11px] text-gray-400">
                            {describeInboxView({
                                mostradas: data.submissions.length, total: data.total,
                                pendientes: data.resumen.pendientes, filtrada,
                            })}
                        </p>
                    )}
                </div>

                {/* ── El listado ──────────────────────────────────────────
                    Tabla en pantalla ancha y tarjetas en móvil, con la tabla
                    dentro de su propio contenedor con desplazamiento: el cuerpo
                    de la página nunca se desplaza a lo ancho. */}
                {cargando && !data ? (
                    <div className="space-y-2">
                        {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />)}
                    </div>
                ) : !data || data.submissions.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                        <Inbox className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                        <p className="text-sm font-bold text-gray-600">
                            {filtrada ? 'Ninguna solicitud coincide con los filtros' : 'Todavía no ha llegado ninguna solicitud'}
                        </p>
                        <p className="text-xs text-gray-400 mt-1.5 max-w-md mx-auto">
                            {filtrada
                                ? 'Puede que exista pero fuera de este filtro.'
                                : 'Cuando un club mande su material por el formulario de una campaña, aparece acá.'}
                        </p>
                        {filtrada && (
                            <button onClick={limpiar} className="mt-4 px-4 py-2.5 rounded-xl bg-rotary-blue text-white text-xs font-black">
                                VER TODAS
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        <div className="hidden lg:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-x-auto scroll-x-visible">
                            <table className="min-w-max w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-[0.12em]">
                                        <th className="text-left px-4 py-3">Quién y qué</th>
                                        <th className="text-left px-4 py-3">Campaña</th>
                                        <th className="text-left px-4 py-3">Origen</th>
                                        <th className="text-left px-4 py-3">Material</th>
                                        <th className="text-left px-4 py-3">Estado</th>
                                        <th className="text-left px-4 py-3">Artículo</th>
                                        <th className="text-left px-4 py-3">Responsable</th>
                                        <th className="text-left px-4 py-3">Llegó</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.submissions.map(s => (
                                        <tr key={s.id} onClick={() => setAbierta({ id: s.id, campaignId: s.campaignId })}
                                            className={`border-b border-gray-50 last:border-0 cursor-pointer hover:bg-sky-50/40 transition-colors ${
                                                isPending(s.status) ? 'bg-amber-50/30' : ''}`}>
                                            <td className="px-4 py-3">
                                                <p className="font-bold text-gray-900" data-no-translate>{s.senderName}</p>
                                                <p className="text-xs text-gray-500 truncate max-w-[280px]">
                                                    {s.title || s.description || 'Sin título'}
                                                </p>
                                                {s.club && <p className="text-[11px] text-gray-400" data-no-translate>{s.club}</p>}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-600 max-w-[200px] truncate">{s.campaignName || '—'}</td>
                                            <td className="px-4 py-3 text-xs text-gray-500">
                                                {s.originClubName
                                                    ? <span className="inline-flex items-center gap-1"><Globe className="w-3 h-3 text-gray-300" />{s.originClubName}</span>
                                                    : <span className="text-gray-300" title="Llegó antes de que se registrara el sitio de origen">—</span>}
                                                {s.district && <span className="block text-[11px] text-gray-400">Distrito {s.district}</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center gap-2 text-xs text-gray-500">
                                                    {s.imageCount > 0 && <span className="inline-flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5 text-gray-300" />{s.imageCount}</span>}
                                                    {s.videoCount > 0 && <span className="inline-flex items-center gap-1"><Film className="w-3.5 h-3.5 text-gray-300" />{s.videoCount}</span>}
                                                    {s.promotedCount > 0 && <span className="inline-flex items-center gap-1 text-emerald-600" title="Ya está en la Biblioteca"><Library className="w-3.5 h-3.5" />{s.promotedCount}</span>}
                                                    {s.imageCount + s.videoCount === 0 && <span className="text-gray-300">Sin archivos</span>}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${stateChip(s.status)}`}>
                                                    {stateLabel(s.status)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                {(() => { const b = articleBadge(s.article?.status); return (
                                                    <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${b.chip}`}>
                                                        {b.label}
                                                    </span>
                                                ); })()}
                                            </td>
                                            <td className="px-4 py-3 text-xs">
                                                {s.assignee
                                                    ? <span className="text-gray-700 font-bold" data-no-translate>{s.assignee}</span>
                                                    : <span className="text-amber-600 font-bold">Sin asignar</span>}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                                                {fmtHora(s.createdAt)}
                                                {s.activityDate && (
                                                    <span className="block text-[11px] text-gray-400">
                                                        Actividad: {activityDateLabel(s.activityDate)}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Móvil y tablet: tarjetas. Una tabla de ocho columnas en un
                            teléfono obliga a desplazarse a lo ancho para leer una fila. */}
                        <div className="lg:hidden space-y-2">
                            {data.submissions.map(s => (
                                <button key={s.id} onClick={() => setAbierta({ id: s.id, campaignId: s.campaignId })}
                                    className={`w-full text-left bg-white rounded-2xl border p-4 hover:border-sky-200 transition-colors ${
                                        isPending(s.status) ? 'border-amber-200' : 'border-gray-100'}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="font-bold text-gray-900 truncate" data-no-translate>{s.senderName}</p>
                                            <p className="text-xs text-gray-500">{s.title || s.description || 'Sin título'}</p>
                                        </div>
                                        <span className="shrink-0 flex flex-col items-end gap-1">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${stateChip(s.status)}`}>
                                                {stateLabel(s.status)}
                                            </span>
                                            {s.article && (() => { const b = articleBadge(s.article.status); return (
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${b.chip}`}>Artículo: {b.label}</span>
                                            ); })()}
                                        </span>
                                    </div>
                                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-400">
                                        <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" />{s.club || 'Sin club'}</span>
                                        <span>{s.campaignName}</span>
                                        {s.imageCount > 0 && <span className="inline-flex items-center gap-1"><ImageIcon className="w-3 h-3" />{s.imageCount}</span>}
                                        {s.videoCount > 0 && <span className="inline-flex items-center gap-1"><Film className="w-3 h-3" />{s.videoCount}</span>}
                                        <span>{fmtFecha(s.createdAt)}</span>
                                    </div>
                                </button>
                            ))}
                        </div>

                        {totalPaginas > 1 && (
                            <div className="flex items-center justify-center gap-2">
                                <button disabled={q.page <= 1} onClick={() => aplicar({ page: q.page - 1 })}
                                    className="px-3 py-2 rounded-xl border-2 border-gray-100 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed">
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <span className="text-xs font-bold text-gray-500">Página {q.page} de {totalPaginas}</span>
                                <button disabled={q.page >= totalPaginas} onClick={() => aplicar({ page: q.page + 1 })}
                                    className="px-3 py-2 rounded-xl border-2 border-gray-100 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed">
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </>
                )}

                {/* La ficha es el MISMO componente que monta la sección dentro
                    del editor de la campaña. Al cerrarla se recarga el listado:
                    es lo que hace que el contador baje sin recargar la página. */}
                {abierta && (
                    <SubmissionDetail
                        campaignId={abierta.campaignId}
                        submissionId={abierta.id}
                        onClose={() => setAbierta(null)}
                        onChanged={cargar}
                    />
                )}
            </div>
        </AdminLayout>
    );
};

export default SubmissionsInbox;
