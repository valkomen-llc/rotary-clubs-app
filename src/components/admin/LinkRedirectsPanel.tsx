// El módulo «Redirecciones de Enlaces».
//
// ⚠️ NO ES PARTE DEL FORMULARIO DE CONFIGURACIÓN, y ésa es la corrección de
// fondo. Hasta v4.992 las redirecciones eran un campo más de `formData`, así
// que dependían de que la pantalla las hubiera CARGADO bien para no perderlas
// al guardar — y no las cargaba, porque `by-domain` no las devuelve. Cada
// guardado escribía una lista vacía encima de las que sí funcionaban.
//
// Ahora cada acción es su propia petición contra `/api/link-redirects` y se
// guarda sola: «Guardar Configuración» no las toca ni puede tocarlas.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Link as LinkIcon, Plus, Trash2, Pencil, Copy, Check, BarChart3,
    Pause, Play, X, ExternalLink, AlertCircle, History,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { validateRule } from '../../lib/linkRedirects';
import { SOURCE_LABELS, DEVICE_LABELS, PERIOD_LABELS, describeSourceEvidence } from '../../lib/linkTracking';

interface Redirect {
    id: string;
    slug: string;
    target: string;
    permanent: boolean;
    forwardQuery: boolean;
    status: 'active' | 'paused';
    notes: string;
    totalClicks: number;
    uniqueVisitors: number;
    botHits: number;
    lastClickAt: string | null;
    createdByName: string;
    createdAt: string;
    updatedByName: string;
    updatedAt: string;
}

// Igual que el resto del panel: la base de la API se lee del entorno de Vite.
const API_URL = import.meta.env.VITE_API_URL || '/api';

const token = () => localStorage.getItem('rotary_token');

/**
 * Ninguna respuesta se lee con `.json()` a ciegas: una página de error HTML
 * rompe el parseo y el error resultante no nombra ninguna capa (v4.946).
 */
async function leerJson(res: Response) {
    const texto = await res.text();
    try { return texto ? JSON.parse(texto) : {}; }
    catch {
        throw new Error(
            `El servidor respondió ${res.status} con algo que no es JSON (${res.headers.get('content-type') || 'sin tipo'}).`
        );
    }
}

async function api(path: string, init: RequestInit = {}) {
    const res = await fetch(`${API_URL}/link-redirects${path}`, {
        ...init,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token()}`,
            ...(init.headers || {}),
        },
    });
    const json = await leerJson(res);
    if (!res.ok) {
        // Un fallo se dice con su CAUSA: 401 se corrige volviendo a entrar y
        // 403 pidiendo el permiso. «No se pudo guardar» a secas obliga a
        // diagnosticar a ciegas (v4.859).
        if (res.status === 401) throw new Error('Tu sesión venció. Volvé a entrar y probá otra vez.');
        if (res.status === 403) throw new Error('Tu rol no puede administrar las redirecciones de este sitio.');
        throw new Error(json?.error || `El servidor respondió ${res.status}.`);
    }
    return json;
}

const fechaCorta = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

/** «hace 3 min». Un instante exacto no dice si el enlace está vivo; esto sí. */
function haceCuanto(v?: string | null) {
    if (!v) return 'sin clics todavía';
    const ms = Date.now() - new Date(v).getTime();
    if (Number.isNaN(ms)) return '—';
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'hace segundos';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    if (d < 30) return `hace ${d} d`;
    return fechaCorta(v);
}

const numero = (n: number) => Number(n || 0).toLocaleString('es-CO');

const VACIO = { slug: '', target: '', permanent: false, forwardQuery: true, notes: '' };

export default function LinkRedirectsPanel({ siteHost }: { siteHost?: string }) {
    const [items, setItems] = useState<Redirect[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [cargando, setCargando] = useState(true);
    const [fallo, setFallo] = useState('');

    const [editando, setEditando] = useState<Redirect | null>(null);
    const [creando, setCreando] = useState(false);
    const [form, setForm] = useState({ ...VACIO });
    const [guardando, setGuardando] = useState(false);
    const [copiado, setCopiado] = useState('');
    const [verStats, setVerStats] = useState<Redirect | null>(null);

    const perPage = 25;

    const cargar = useCallback(async () => {
        setCargando(true);
        setFallo('');
        try {
            const data = await api(`?page=${page}&perPage=${perPage}`);
            setItems(data.items || []);
            setTotal(data.total || 0);
        } catch (e: any) {
            // El listado NO se vacía en silencio ante un fallo: un vacío sin
            // explicación es indistinguible de «no hay ninguna» (v4.938), que
            // es exactamente el defecto que este módulo vino a corregir.
            setFallo(e.message || 'No se pudieron cargar las redirecciones.');
        } finally {
            setCargando(false);
        }
    }, [page]);

    useEffect(() => { cargar(); }, [cargar]);

    const dominio = useMemo(
        () => (siteHost || window.location.host).replace(/^www\./, ''),
        [siteHost]
    );

    const errorDeForma = useMemo(() => {
        if (!form.slug && !form.target) return '';
        const otras = items
            .filter(i => i.id !== editando?.id)
            .map(i => ({ from: i.slug, to: i.target, permanent: i.permanent }));
        const v = validateRule({ from: form.slug, to: form.target, permanent: form.permanent }, otras);
        return v.ok ? '' : v.error;
    }, [form, items, editando]);

    const abrirNueva = () => { setForm({ ...VACIO }); setEditando(null); setCreando(true); };
    const abrirEdicion = (r: Redirect) => {
        setForm({ slug: r.slug, target: r.target, permanent: r.permanent, forwardQuery: r.forwardQuery, notes: r.notes || '' });
        setEditando(r);
        setCreando(true);
    };
    const cerrar = () => { setCreando(false); setEditando(null); setForm({ ...VACIO }); };

    const guardar = async () => {
        if (errorDeForma) { toast.error(errorDeForma); return; }
        setGuardando(true);
        try {
            if (editando) {
                await api(`/${editando.id}`, { method: 'PUT', body: JSON.stringify(form) });
                toast.success('Redirección actualizada. Su historial de clics se conserva.');
            } else {
                await api('', { method: 'POST', body: JSON.stringify(form) });
                toast.success('Redirección creada y activa.');
            }
            cerrar();
            await cargar();
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setGuardando(false);
        }
    };

    const cambiarEstado = async (r: Redirect) => {
        const nuevo = r.status === 'active' ? 'paused' : 'active';
        try {
            await api(`/${r.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: nuevo }) });
            toast.success(nuevo === 'paused'
                ? 'Enlace pausado. Deja de saltar y conserva todas sus estadísticas.'
                : 'Enlace activo otra vez.');
            await cargar();
        } catch (e: any) { toast.error(e.message); }
    };

    const eliminar = async (r: Redirect) => {
        // La confirmación DICE qué va a pasar, no pregunta «¿estás seguro?».
        const ok = window.confirm(
            `Eliminar «${r.slug}».\n\n` +
            `Todos los enlaces ya repartidos con esa dirección dejarán de funcionar en el acto.\n` +
            `Sus ${numero(r.totalClicks)} clics quedan registrados y la dirección vuelve a quedar libre.`
        );
        if (!ok) return;
        try {
            await api(`/${r.id}`, { method: 'DELETE', body: JSON.stringify({ confirm: true }) });
            toast.success('Redirección eliminada.');
            await cargar();
        } catch (e: any) { toast.error(e.message); }
    };

    const copiar = async (r: Redirect) => {
        const url = `https://${dominio}${r.slug}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopiado(r.id);
            setTimeout(() => setCopiado(''), 1800);
        } catch { toast.error('El navegador no dejó copiar. La dirección es: ' + url); }
    };

    const paginas = Math.max(1, Math.ceil(total / perPage));

    return (
        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-3">
                    <LinkIcon className="w-5 h-5 text-rotary-blue" /> Redirecciones de Enlaces
                </h3>
                <button
                    type="button" onClick={abrirNueva}
                    className="flex items-center gap-2 px-5 py-2.5 bg-rotary-blue text-white rounded-xl text-sm font-bold hover:bg-rotary-navy transition-colors"
                >
                    <Plus className="w-4 h-4" /> Agregar redirección
                </button>
            </div>

            <p className="text-xs text-gray-400 mb-6 max-w-3xl">
                Direcciones cortas de tu propio dominio que llevan a otra parte. Sirven para compartir por WhatsApp,
                imprimir en un pendón o decir en voz alta: si el destino cambia, cambiás la redirección y el enlace
                repartido sigue sirviendo. El salto lo hace el servidor, así que funciona también en las vistas previas
                de WhatsApp y para los buscadores. <strong className="text-gray-500">Cada una se guarda por su cuenta</strong> —
                no dependen del botón «Guardar Configuración» — y cada clic queda medido.
            </p>

            {fallo && (
                <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/60 p-4">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <div className="text-sm text-red-700">
                        <p className="font-semibold">No se pudo cargar el listado.</p>
                        <p className="text-xs mt-1">{fallo}</p>
                        <button onClick={cargar} className="mt-2 text-xs font-bold underline">Reintentar</button>
                    </div>
                </div>
            )}

            {cargando && <p className="text-sm text-gray-400 py-6 text-center">Cargando redirecciones…</p>}

            {!cargando && !fallo && items.length === 0 && (
                <p className="text-sm text-gray-400 italic py-8 text-center border-2 border-dashed border-gray-100 rounded-2xl">
                    Todavía no hay ninguna redirección.
                </p>
            )}

            {!cargando && items.length > 0 && (
                <div className="scroll-x-visible overflow-x-auto -mx-2 px-2">
                    <table className="min-w-max w-full text-sm">
                        <thead>
                            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                                <th className="py-3 pr-4 font-semibold">Enlace corto</th>
                                <th className="py-3 pr-4 font-semibold">Destino</th>
                                <th className="py-3 pr-4 font-semibold">Estado</th>
                                <th className="py-3 pr-4 font-semibold text-right">Clics</th>
                                <th className="py-3 pr-4 font-semibold text-right">Visitantes</th>
                                <th className="py-3 pr-4 font-semibold">Creada</th>
                                <th className="py-3 pr-4 font-semibold">Último clic</th>
                                <th className="py-3 font-semibold">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {items.map(r => (
                                <tr key={r.id} className="group hover:bg-gray-50/60">
                                    <td className="py-3 pr-4 font-mono text-[13px] text-gray-800 whitespace-nowrap">
                                        {r.slug}
                                        {r.permanent && (
                                            <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600 font-sans font-bold">301</span>
                                        )}
                                    </td>
                                    <td className="py-3 pr-4 max-w-[280px]">
                                        <a
                                            href={r.target} target="_blank" rel="noreferrer"
                                            className="text-gray-500 hover:text-rotary-blue truncate block"
                                            title={r.target}
                                        >
                                            {r.target}
                                        </a>
                                    </td>
                                    <td className="py-3 pr-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                            r.status === 'active'
                                                ? 'bg-emerald-50 text-emerald-700'
                                                : 'bg-gray-100 text-gray-500'
                                        }`}>
                                            <span className={`w-1.5 h-1.5 rounded-full ${r.status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                                            {r.status === 'active' ? 'Activo' : 'Pausado'}
                                        </span>
                                    </td>
                                    <td className="py-3 pr-4 text-right tabular-nums font-semibold text-gray-800">{numero(r.totalClicks)}</td>
                                    <td className="py-3 pr-4 text-right tabular-nums text-gray-500">{numero(r.uniqueVisitors)}</td>
                                    <td className="py-3 pr-4 text-gray-400 text-xs whitespace-nowrap">{fechaCorta(r.createdAt)}</td>
                                    <td className="py-3 pr-4 text-gray-400 text-xs whitespace-nowrap">{haceCuanto(r.lastClickAt)}</td>
                                    <td className="py-3">
                                        <div className="flex items-center gap-1">
                                            <IconBtn onClick={() => setVerStats(r)} title={`Ver estadísticas de ${r.slug}`}><BarChart3 className="w-4 h-4" /></IconBtn>
                                            <IconBtn onClick={() => copiar(r)} title={`Copiar el enlace ${r.slug}`}>
                                                {copiado === r.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                            </IconBtn>
                                            <IconBtn onClick={() => abrirEdicion(r)} title={`Editar ${r.slug}`}><Pencil className="w-4 h-4" /></IconBtn>
                                            <IconBtn onClick={() => cambiarEstado(r)} title={r.status === 'active' ? `Pausar ${r.slug}` : `Activar ${r.slug}`}>
                                                {r.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                            </IconBtn>
                                            <IconBtn onClick={() => eliminar(r)} title={`Eliminar ${r.slug}`} peligro><Trash2 className="w-4 h-4" /></IconBtn>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {paginas > 1 && (
                <div className="flex items-center justify-between mt-5 text-xs text-gray-400">
                    <span>{numero(total)} redirecciones · página {page} de {paginas}</span>
                    <div className="flex gap-2">
                        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40">Anterior</button>
                        <button disabled={page >= paginas} onClick={() => setPage(p => p + 1)}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 disabled:opacity-40">Siguiente</button>
                    </div>
                </div>
            )}

            <p className="text-[11px] text-gray-400 mt-5">
                No se pueden redirigir la portada ni las direcciones del sistema (<code>/admin</code>, <code>/api</code>…):
                una redirección ahí dejaría el panel inaccesible.
            </p>

            {creando && (
                <EditorModal
                    form={form} setForm={setForm} error={errorDeForma} guardando={guardando}
                    dominio={dominio} editando={!!editando} onCerrar={cerrar} onGuardar={guardar}
                />
            )}

            {verStats && <StatsModal link={verStats} dominio={dominio} onCerrar={() => setVerStats(null)} />}
        </div>
    );
}

function IconBtn({ children, onClick, title, peligro }: {
    children: React.ReactNode; onClick: () => void; title: string; peligro?: boolean;
}) {
    return (
        <button
            type="button" onClick={onClick} title={title} aria-label={title}
            className={`p-2 rounded-lg text-gray-300 transition-colors ${
                peligro ? 'hover:text-red-500 hover:bg-red-50' : 'hover:text-rotary-blue hover:bg-sky-50'
            }`}
        >
            {children}
        </button>
    );
}

// ── El editor ───────────────────────────────────────────────────────────────

function EditorModal({ form, setForm, error, guardando, dominio, editando, onCerrar, onGuardar }: any) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCerrar}>
            <div
                className="bg-white rounded-3xl w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto p-8 shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-6">
                    <h4 className="text-lg font-bold text-gray-800">
                        {editando ? 'Editar redirección' : 'Nueva redirección'}
                    </h4>
                    <button onClick={onCerrar} aria-label="Cerrar" className="p-2 text-gray-300 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {editando && (
                    <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl p-3 mb-5">
                        Cambiar el destino <strong>no borra las estadísticas</strong>: el historial cuelga del enlace,
                        no del texto de la dirección.
                    </p>
                )}

                <label className="block text-xs font-semibold text-gray-500 mb-2">DIRECCIÓN CORTA</label>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-gray-400 font-mono flex-shrink-0">{dominio}</span>
                    <input
                        type="text" value={form.slug}
                        onChange={e => setForm({ ...form, slug: e.target.value })}
                        placeholder="/conferencia"
                        className="w-full min-w-0 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue outline-none font-mono text-sm"
                    />
                </div>
                <p className="text-[11px] text-gray-400 mb-5">Sin espacios, sin acentos raros y sin la parte de la query.</p>

                <label className="block text-xs font-semibold text-gray-500 mb-2">LLEVA A</label>
                <input
                    type="text" value={form.target}
                    onChange={e => setForm({ ...form, target: e.target.value })}
                    placeholder="https://ejemplo.org/inscripcion   o   /eventos"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue outline-none text-sm mb-5"
                />

                <label className="block text-xs font-semibold text-gray-500 mb-2">NOTA INTERNA (opcional)</label>
                <input
                    type="text" value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })}
                    placeholder="Para el pendón de la conferencia"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue outline-none text-sm mb-5"
                />

                <div className="space-y-3 mb-6">
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={form.forwardQuery !== false}
                            onChange={e => setForm({ ...form, forwardQuery: e.target.checked })}
                            className="rounded border-gray-300 mt-0.5" />
                        <span className="text-xs text-gray-500">
                            <strong className="text-gray-700">Pasar los parámetros al destino.</strong> Lo que venga
                            en la dirección (<code>?utm_source=…</code>) sigue viaje. Los UTM <strong>se miden igual</strong>
                            {' '}esté marcado o no: medir y reenviar son dos cosas distintas.
                        </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={form.permanent === true}
                            onChange={e => setForm({ ...form, permanent: e.target.checked })}
                            className="rounded border-gray-300 mt-0.5" />
                        <span className="text-xs text-gray-500">
                            <strong className="text-gray-700">Permanente (301).</strong> El navegador la recuerda durante
                            meses: si después la corregís, quien ya la visitó puede seguir yendo al destino viejo — y
                            <strong> sus clics dejan de contarse</strong>, porque deja de preguntar. Dejalo sin marcar
                            salvo que sepas que el destino no va a cambiar nunca.
                        </span>
                    </label>
                </div>

                {error && (
                    <p className="text-xs text-red-600 bg-red-50 rounded-xl p-3 mb-5 font-medium">{error}</p>
                )}

                <div className="flex justify-end gap-3">
                    <button onClick={onCerrar} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-50">
                        Cancelar
                    </button>
                    <button
                        onClick={onGuardar} disabled={guardando || !!error || !form.slug || !form.target}
                        className="px-6 py-2.5 rounded-xl bg-rotary-blue text-white text-sm font-bold hover:bg-rotary-navy disabled:opacity-40 transition-colors"
                    >
                        {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear redirección'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Las estadísticas ────────────────────────────────────────────────────────

function StatsModal({ link, dominio, onCerrar }: { link: Redirect; dominio: string; onCerrar: () => void }) {
    const [period, setPeriod] = useState('d30');
    const [data, setData] = useState<any>(null);
    const [audit, setAudit] = useState<any[]>([]);
    const [cargando, setCargando] = useState(true);
    const [fallo, setFallo] = useState('');

    useEffect(() => {
        let vivo = true;
        setCargando(true); setFallo('');
        api(`/${link.id}/stats?period=${period}`)
            .then(d => { if (vivo) setData(d); })
            .catch(e => { if (vivo) setFallo(e.message); })
            .finally(() => { if (vivo) setCargando(false); });
        return () => { vivo = false; };
    }, [link.id, period]);

    useEffect(() => {
        let vivo = true;
        api(`/${link.id}/audit`).then(d => { if (vivo) setAudit(d.items || []); }).catch(() => {});
        return () => { vivo = false; };
    }, [link.id]);

    const maxClicks = useMemo(
        () => Math.max(1, ...(data?.series || []).map((d: any) => d.clicks)),
        [data]
    );

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onCerrar}>
            <div
                className="bg-white rounded-3xl w-full max-w-4xl my-8 p-8 shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="min-w-0">
                        <h4 className="text-lg font-bold text-gray-800 font-mono truncate">{link.slug}</h4>
                        <a href={link.target} target="_blank" rel="noreferrer"
                            className="text-xs text-gray-400 hover:text-rotary-blue inline-flex items-center gap-1 truncate max-w-full">
                            {link.target} <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <select
                            value={period} onChange={e => setPeriod(e.target.value)}
                            aria-label="Período de las estadísticas"
                            className="px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rotary-blue"
                        >
                            {Object.entries(PERIOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <button onClick={onCerrar} aria-label="Cerrar" className="p-2 text-gray-300 hover:text-gray-600">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {fallo && <p className="text-sm text-red-600 bg-red-50 rounded-xl p-4">{fallo}</p>}
                {cargando && <p className="text-sm text-gray-400 py-10 text-center">Cargando estadísticas…</p>}

                {data && !cargando && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
                            <Kpi label="Clics totales" value={numero(data.totals.clicks)} destacado />
                            <Kpi label="Visitantes únicos" value={numero(data.totals.uniqueVisitors)} />
                            <Kpi label="Hoy" value={numero(data.totals.today)} />
                            <Kpi label="Últimos 7 días" value={numero(data.totals.last7)} />
                            <Kpi label="Últimos 30 días" value={numero(data.totals.last30)} />
                            <Kpi label="Último clic" value={haceCuanto(data.totals.lastClickAt)} pequeno />
                        </div>

                        {data.totals.bots > 0 && (
                            <p className="text-[11px] text-gray-400 -mt-5 mb-7">
                                Además se registraron <strong>{numero(data.totals.bots)}</strong> accesos automáticos
                                (vistas previas de WhatsApp y redes, rastreadores y comprobaciones).
                                <strong> No se cuentan como clics</strong>: no los hizo una persona.
                            </p>
                        )}

                        <Seccion titulo={`Clics por día · ${data.period.label}`}>
                            {data.series.length === 0
                                ? <p className="text-xs text-gray-400 italic">Sin clics en este período.</p>
                                : (
                                    <div className="flex items-end gap-[3px] h-32">
                                        {data.series.map((d: any) => (
                                            <div key={d.day} className="flex-1 min-w-[3px] group relative flex flex-col justify-end h-full">
                                                <div
                                                    className="w-full bg-rotary-blue/80 rounded-t group-hover:bg-rotary-blue transition-colors"
                                                    style={{ height: `${Math.max(d.clicks ? 4 : 0, (d.clicks / maxClicks) * 100)}%` }}
                                                />
                                                <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block whitespace-nowrap rounded-lg bg-gray-800 px-2 py-1 text-[10px] text-white">
                                                    {d.day}: {numero(d.clicks)} clic{d.clicks === 1 ? '' : 's'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                        </Seccion>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <Seccion titulo="Fuente del tráfico">
                                <Barras
                                    filas={(data.sources || []).map((s: any) => ({
                                        label: SOURCE_LABELS[s.kind] || s.label || s.kind,
                                        value: s.clicks,
                                    }))}
                                />
                                <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
                                    {describeSourceEvidence()}
                                </p>
                            </Seccion>

                            <Seccion titulo="Dispositivo">
                                <Barras
                                    filas={(data.devices || []).map((d: any) => ({
                                        label: DEVICE_LABELS[d.device] || d.device,
                                        value: d.clicks,
                                    }))}
                                />
                            </Seccion>

                            <Seccion titulo="Ubicación">
                                {data.countries?.length
                                    ? <Barras filas={data.countries.map((c: any) => ({ label: c.country, value: c.clicks }))} />
                                    : <p className="text-xs text-gray-400 italic">
                                        Sin datos de ubicación en este período. El país lo entrega la red, no siempre llega.
                                    </p>}
                            </Seccion>

                            <Seccion titulo="Navegador">
                                <Barras filas={(data.browsers || []).map((b: any) => ({ label: b.browser, value: b.clicks }))} />
                            </Seccion>
                        </div>

                        <Seccion titulo="Campañas (UTM)">
                            {data.campaigns?.length ? (
                                <div className="scroll-x-visible overflow-x-auto">
                                    <table className="min-w-max w-full text-xs">
                                        <thead>
                                            <tr className="text-left text-[10px] uppercase text-gray-400 border-b border-gray-100">
                                                <th className="py-2 pr-4">source</th><th className="py-2 pr-4">medium</th>
                                                <th className="py-2 pr-4">campaign</th><th className="py-2 pr-4">content</th>
                                                <th className="py-2 pr-4">term</th><th className="py-2 text-right">Clics</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {data.campaigns.map((c: any, i: number) => (
                                                <tr key={i}>
                                                    <td className="py-2 pr-4 font-mono">{c.utmSource || '—'}</td>
                                                    <td className="py-2 pr-4 font-mono">{c.utmMedium || '—'}</td>
                                                    <td className="py-2 pr-4 font-mono">{c.utmCampaign || '—'}</td>
                                                    <td className="py-2 pr-4 font-mono">{c.utmContent || '—'}</td>
                                                    <td className="py-2 pr-4 font-mono">{c.utmTerm || '—'}</td>
                                                    <td className="py-2 text-right tabular-nums font-semibold">{numero(c.clicks)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="text-xs text-gray-400 italic">
                                    Ningún clic llegó con parámetros de campaña. Agregalos al compartir:
                                    <code className="ml-1 text-gray-500">https://{dominio}{link.slug}?utm_source=instagram&amp;utm_medium=social&amp;utm_campaign=feria2026</code>
                                </p>
                            )}
                        </Seccion>

                        {audit.length > 0 && (
                            <Seccion titulo="Historial administrativo">
                                <ul className="space-y-2">
                                    {audit.map((a, i) => (
                                        <li key={i} className="flex items-start gap-3 text-xs text-gray-500">
                                            <History className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0" />
                                            <span>
                                                <strong className="text-gray-700">{ACCIONES[a.action] || a.action}</strong>
                                                {a.actorName ? ` · ${a.actorName}` : ''} · {fechaCorta(a.createdAt)}
                                                {a.fromTarget && a.toTarget && a.fromTarget !== a.toTarget && (
                                                    <span className="block text-[11px] text-gray-400 font-mono mt-0.5">
                                                        {a.fromTarget} → {a.toTarget}
                                                    </span>
                                                )}
                                                {a.detail && <span className="block text-[11px] text-gray-400 mt-0.5">{a.detail}</span>}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </Seccion>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

const ACCIONES: Record<string, string> = {
    created: 'Creada', edited: 'Editada', paused: 'Pausada',
    activated: 'Activada', deleted: 'Eliminada', migrated: 'Importada',
};

function Kpi({ label, value, destacado, pequeno }: { label: string; value: string; destacado?: boolean; pequeno?: boolean }) {
    return (
        <div className={`rounded-2xl p-4 ${destacado ? 'bg-rotary-blue text-white' : 'bg-gray-50'}`}>
            <p className={`text-[10px] uppercase tracking-wide font-semibold ${destacado ? 'text-white/70' : 'text-gray-400'}`}>{label}</p>
            <p className={`${pequeno ? 'text-sm' : 'text-2xl'} font-bold mt-1 ${destacado ? 'text-white' : 'text-gray-800'} tabular-nums`}>{value}</p>
        </div>
    );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
    return (
        <div className="mb-8">
            <h5 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">{titulo}</h5>
            {children}
        </div>
    );
}

function Barras({ filas }: { filas: Array<{ label: string; value: number }> }) {
    if (!filas.length) return <p className="text-xs text-gray-400 italic">Sin datos en este período.</p>;
    const max = Math.max(1, ...filas.map(f => f.value));
    return (
        <ul className="space-y-2">
            {filas.map((f, i) => (
                <li key={i}>
                    <div className="flex items-baseline justify-between text-xs mb-1">
                        <span className="text-gray-600 truncate pr-2">{f.label}</span>
                        <span className="text-gray-400 tabular-nums flex-shrink-0">{numero(f.value)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full bg-rotary-blue/70 rounded-full" style={{ width: `${(f.value / max) * 100}%` }} />
                    </div>
                </li>
            ))}
        </ul>
    );
}
