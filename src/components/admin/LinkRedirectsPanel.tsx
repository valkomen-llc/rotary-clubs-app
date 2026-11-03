// El módulo «Enlaces inteligentes y códigos QR» (antes «Redirecciones de
// Enlaces»; v4.993 lo sacó del formulario, v4.1278 le agregó los QR).
//
// ⚠️ NO ES PARTE DEL FORMULARIO DE CONFIGURACIÓN, y ésa es la corrección de
// fondo. Hasta v4.992 las redirecciones eran un campo más de `formData`, así
// que dependían de que la pantalla las hubiera CARGADO bien para no perderlas
// al guardar — y no las cargaba, porque `by-domain` no las devuelve. Cada
// guardado escribía una lista vacía encima de las que sí funcionaban.
//
// Ahora cada acción es su propia petición contra `/api/link-redirects` y se
// guarda sola: «Guardar Configuración» no las toca ni puede tocarlas.
//
// Desde v4.1278 cada enlace puede tener varios códigos QR (uno por pieza:
// afiche, redes, invitación…) que llevan al mismo destino y se miden por
// separado. Los QR viven en `link-qr/`; acá queda el listado de enlaces, el
// editor del enlace, el resumen del sitio y las estadísticas del enlace con la
// comparación entre sus QR.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Link as LinkIcon, Plus, Trash2, Pencil, Copy, Check, BarChart3,
    Pause, Play, X, ExternalLink, AlertCircle, History, QrCode, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { validateRule } from '../../lib/linkRedirects';
import { SOURCE_LABELS, DEVICE_LABELS, PERIOD_LABELS, describeSourceEvidence } from '../../lib/linkTracking';
import { QR_STATE_LABELS, QR_MEDIA_SHORT, QR_AUDIT_ACTIONS } from '../../lib/linkQr';
import { api, type Redirect, type QrDto } from './link-qr/api';
import {
    Kpi, Seccion, Barras, SerieBarras, EstadoPill, IconBtn, numero, haceCuanto, fechaCorta, fechaHora,
} from './link-qr/StatsBits';
import QrDrawer from './link-qr/QrDrawer';

const VACIO = { name: '', slug: '', target: '', permanent: false, forwardQuery: true, notes: '' };

/**
 * ¿El destino escrito apunta a un objeto de nuestro almacenamiento?
 *
 * Se reconoce por la FORMA del host de S3, no por el nombre del bucket: el
 * panel no lo conoce y pedirlo al servidor por cada tecla sería un viaje de red
 * por pulsación. Quien DECIDE qué se sirve sigue siendo el servidor.
 */
const pareceObjetoDeS3 = (valor: string) => {
    try {
        const h = new URL(String(valor || '')).hostname.toLowerCase();
        return /(^|\.)s3[.-][a-z0-9-]+\.amazonaws\.com$/.test(h) || h === 's3.amazonaws.com';
    } catch { return false; }
};

export default function LinkRedirectsPanel({ siteHost, siteLogo }: { siteHost?: string; siteLogo?: string }) {
    const [items, setItems] = useState<Redirect[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [cargando, setCargando] = useState(true);
    const [fallo, setFallo] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('');

    const [editando, setEditando] = useState<Redirect | null>(null);
    const [creando, setCreando] = useState(false);
    const [form, setForm] = useState({ ...VACIO });
    const [guardando, setGuardando] = useState(false);
    const [copiado, setCopiado] = useState('');
    const [verStats, setVerStats] = useState<Redirect | null>(null);
    const [verQr, setVerQr] = useState<Redirect | null>(null);

    const [resumen, setResumen] = useState<any>(null);
    const [resumenVersion, setResumenVersion] = useState(0);

    const perPage = 25;

    const cargar = useCallback(async () => {
        setCargando(true);
        setFallo('');
        try {
            const qs = new URLSearchParams({ page: String(page), perPage: String(perPage) });
            if (busqueda.trim()) qs.set('q', busqueda.trim());
            if (filtroEstado) qs.set('status', filtroEstado);
            const data = await api(`?${qs.toString()}`);
            setItems(data.items || []);
            setTotal(data.total || 0);
        } catch (e: any) {
            // El listado NO se vacía en silencio ante un fallo: un vacío sin
            // explicación es indistinguible de «no hay ninguna» (v4.938), que
            // es exactamente el defecto que este módulo vino a corregir.
            setFallo(e.message || 'No se pudieron cargar los enlaces.');
        } finally {
            setCargando(false);
        }
    }, [page, busqueda, filtroEstado]);

    useEffect(() => { cargar(); }, [cargar]);

    // El resumen del sitio se recarga con cada cambio del listado o de los QR.
    useEffect(() => {
        let vivo = true;
        api('/overview?period=d30').then(d => { if (vivo) setResumen(d); }).catch(() => { if (vivo) setResumen(null); });
        return () => { vivo = false; };
    }, [resumenVersion]);

    const recargarTodo = useCallback(async () => {
        await cargar();
        setResumenVersion(v => v + 1);
    }, [cargar]);

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
        setForm({ name: r.name || '', slug: r.slug, target: r.target, permanent: r.permanent, forwardQuery: r.forwardQuery, notes: r.notes || '' });
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
                toast.success('Enlace actualizado. Su historial y sus códigos QR se conservan.');
            } else {
                await api('', { method: 'POST', body: JSON.stringify(form) });
                toast.success('Enlace creado y activo. Ya podés generarle códigos QR.');
            }
            cerrar();
            await recargarTodo();
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
                ? 'Enlace pausado. Deja de saltar —también sus QR— y conserva todas sus estadísticas.'
                : 'Enlace activo otra vez.');
            await recargarTodo();
        } catch (e: any) { toast.error(e.message); }
    };

    const eliminar = async (r: Redirect) => {
        // La confirmación DICE qué va a pasar, no pregunta «¿estás seguro?».
        const ok = window.confirm(
            `Eliminar «${r.name || r.slug}».\n\n` +
            `Todos los enlaces ya repartidos con esa dirección dejarán de funcionar en el acto` +
            (r.qrCount ? `, y sus ${r.qrCount} código${r.qrCount === 1 ? '' : 's'} QR mostrarán «este enlace ya no existe».\n` : '.\n') +
            `Sus ${numero(r.totalClicks)} clics quedan registrados y la dirección vuelve a quedar libre.`
        );
        if (!ok) return;
        try {
            await api(`/${r.id}`, { method: 'DELETE', body: JSON.stringify({ confirm: true }) });
            toast.success('Enlace eliminado.');
            await recargarTodo();
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
                    <LinkIcon className="w-5 h-5 text-rotary-blue" /> Enlaces inteligentes y códigos QR
                </h3>
                <button
                    type="button" onClick={abrirNueva}
                    className="flex items-center gap-2 px-5 py-2.5 bg-rotary-blue text-white rounded-xl text-sm font-bold hover:bg-rotary-navy transition-colors"
                >
                    <Plus className="w-4 h-4" /> Crear enlace inteligente
                </button>
            </div>

            <p className="text-xs text-gray-400 mb-6 max-w-3xl">
                Direcciones cortas de tu propio dominio que llevan a otra parte, con uno o varios <strong className="text-gray-500">códigos QR</strong> cada
                una. Sirven para compartir por WhatsApp, imprimir en un afiche o decir en voz alta: si el destino cambia,
                cambiás el enlace y lo repartido —también lo impreso— sigue sirviendo. El salto lo hace el servidor, así que
                funciona en las vistas previas de WhatsApp y para los buscadores. <strong className="text-gray-500">Cada uno se guarda
                por su cuenta</strong> —no dependen del botón «Guardar Configuración»— y cada acceso queda medido, distinguiendo
                los que vinieron por QR de los del enlace compartido.
            </p>

            {resumen && resumen.totals && (resumen.totals.links > 0) && <ResumenSitio data={resumen} />}

            <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-[220px] max-w-md">
                    <Search className="w-4 h-4 text-gray-300 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        value={busqueda} onChange={e => { setPage(1); setBusqueda(e.target.value); }}
                        placeholder="Buscar por nombre, dirección o destino…"
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-rotary-blue"
                    />
                </div>
                <select value={filtroEstado} onChange={e => { setPage(1); setFiltroEstado(e.target.value); }} aria-label="Filtrar por estado"
                    className="px-3 py-2 border border-gray-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-rotary-blue">
                    <option value="">Todos los estados</option>
                    <option value="active">Activos</option>
                    <option value="paused">Pausados</option>
                </select>
            </div>

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

            {cargando && <p className="text-sm text-gray-400 py-6 text-center">Cargando enlaces…</p>}

            {!cargando && !fallo && items.length === 0 && (
                <p className="text-sm text-gray-400 italic py-8 text-center border-2 border-dashed border-gray-100 rounded-2xl">
                    {busqueda || filtroEstado ? 'Ningún enlace coincide con el filtro.' : 'Todavía no hay ningún enlace.'}
                </p>
            )}

            {!cargando && items.length > 0 && (
                <div className="scroll-x-visible overflow-x-auto -mx-2 px-2">
                    <table className="min-w-max w-full text-sm">
                        <thead>
                            <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                                <th className="py-3 pr-4 font-semibold">Enlace</th>
                                <th className="py-3 pr-4 font-semibold">Destino</th>
                                <th className="py-3 pr-4 font-semibold">Estado</th>
                                <th className="py-3 pr-4 font-semibold text-center">QR</th>
                                <th className="py-3 pr-4 font-semibold text-right">Accesos</th>
                                <th className="py-3 pr-4 font-semibold text-right">Por QR</th>
                                <th className="py-3 pr-4 font-semibold text-right">Directos</th>
                                <th className="py-3 pr-4 font-semibold">Creado</th>
                                <th className="py-3 pr-4 font-semibold">Último</th>
                                <th className="py-3 font-semibold">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {items.map(r => {
                                const porQr = Number(r.qrScans || 0);
                                const directos = Math.max(0, Number(r.totalClicks || 0) - porQr);
                                return (
                                    <tr key={r.id} className="group hover:bg-gray-50/60">
                                        <td className="py-3 pr-4 max-w-[240px]">
                                            <p className="font-semibold text-gray-800 truncate">{r.name || r.slug}</p>
                                            <p className="font-mono text-[12px] text-gray-400 truncate">
                                                {dominio}{r.slug}
                                                {r.permanent && <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-600 font-sans font-bold">301</span>}
                                            </p>
                                        </td>
                                        <td className="py-3 pr-4 max-w-[240px]">
                                            <a href={r.target} target="_blank" rel="noreferrer"
                                                className="text-gray-500 hover:text-rotary-blue truncate block" title={r.target}>
                                                {r.target}
                                            </a>
                                        </td>
                                        <td className="py-3 pr-4 whitespace-nowrap">
                                            <EstadoPill state={r.status} texto={r.status === 'active' ? 'Activo' : 'Pausado'} />
                                        </td>
                                        <td className="py-3 pr-4 text-center">
                                            <button type="button" onClick={() => setVerQr(r)} title="Ver y generar códigos QR"
                                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                                                    r.qrCount ? 'bg-sky-50 text-rotary-blue hover:bg-sky-100' : 'text-gray-300 hover:text-rotary-blue hover:bg-sky-50'
                                                }`}>
                                                <QrCode className="w-3.5 h-3.5" /> {r.qrCount || 0}
                                            </button>
                                        </td>
                                        <td className="py-3 pr-4 text-right tabular-nums font-semibold text-gray-800">{numero(r.totalClicks)}</td>
                                        <td className="py-3 pr-4 text-right tabular-nums text-amber-700">{numero(porQr)}</td>
                                        <td className="py-3 pr-4 text-right tabular-nums text-gray-500">{numero(directos)}</td>
                                        <td className="py-3 pr-4 text-gray-400 text-xs whitespace-nowrap">{fechaCorta(r.createdAt)}</td>
                                        <td className="py-3 pr-4 text-gray-400 text-xs whitespace-nowrap">{haceCuanto(r.lastClickAt)}</td>
                                        <td className="py-3">
                                            <div className="flex items-center gap-0.5">
                                                <IconBtn onClick={() => setVerStats(r)} title={`Estadísticas de ${r.name || r.slug}`}><BarChart3 className="w-4 h-4" /></IconBtn>
                                                <IconBtn onClick={() => copiar(r)} title={`Copiar el enlace ${r.slug}`}>
                                                    {copiado === r.id ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                                </IconBtn>
                                                <IconBtn onClick={() => setVerQr(r)} title={`Generar código QR para ${r.name || r.slug}`}><QrCode className="w-4 h-4" /></IconBtn>
                                                <IconBtn onClick={() => abrirEdicion(r)} title={`Editar ${r.name || r.slug}`}><Pencil className="w-4 h-4" /></IconBtn>
                                                <IconBtn onClick={() => cambiarEstado(r)} title={r.status === 'active' ? `Pausar ${r.slug}` : `Activar ${r.slug}`}>
                                                    {r.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                                                </IconBtn>
                                                <IconBtn onClick={() => eliminar(r)} title={`Eliminar ${r.slug}`} peligro><Trash2 className="w-4 h-4" /></IconBtn>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {paginas > 1 && (
                <div className="flex items-center justify-between mt-5 text-xs text-gray-400">
                    <span>{numero(total)} enlaces · página {page} de {paginas}</span>
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
                una redirección ahí dejaría el panel inaccesible. «Accesos» cuenta personas que llegaron al destino; las
                vistas previas de WhatsApp y los rastreadores se cuentan aparte.
            </p>

            {creando && (
                <EditorModal
                    form={form} setForm={setForm} error={errorDeForma} guardando={guardando}
                    dominio={dominio} editando={!!editando} onCerrar={cerrar} onGuardar={guardar}
                />
            )}

            {verStats && <StatsModal link={verStats} dominio={dominio} onCerrar={() => setVerStats(null)} onVerQr={() => { setVerQr(verStats); setVerStats(null); }} />}

            {verQr && (
                <QrDrawer
                    link={verQr} dominio={dominio} siteLogo={siteLogo}
                    onCerrar={() => setVerQr(null)}
                    onCambio={() => { recargarTodo(); }}
                />
            )}
        </div>
    );
}

// ── El resumen del sitio ────────────────────────────────────────────────────

function ResumenSitio({ data }: { data: any }) {
    const t = data.totals || {};
    const top: any = (data.topQrs || [])[0];
    const topCamp: any = (data.topCampaigns || [])[0];
    return (
        <div className="mb-6 rounded-2xl bg-gray-50/70 border border-gray-100 p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <Kpi label="Accesos (30 días)" value={numero(t.periodClicks)} destacado nota={`${numero(t.clicks)} en total`} />
                <Kpi label="Por QR (30 días)" value={numero(t.periodQrScans)} nota={`${numero(t.qrScans)} en total`} />
                <Kpi label="Directos (30 días)" value={numero(t.periodLinkClicks)} />
                <Kpi label="Enlaces activos" value={`${numero(t.activeLinks)} / ${numero(t.links)}`} />
                <Kpi label="QR activos" value={`${numero(t.qrStates?.active)} / ${numero(t.qrs)}`}
                    nota={t.qrStates?.expired ? `${numero(t.qrStates.expired)} vencido${t.qrStates.expired === 1 ? '' : 's'}` : undefined} />
                <Kpi label="QR con más accesos" value={top && top.periodScans ? top.name : '—'} pequeno
                    nota={top && top.periodScans ? `${numero(top.periodScans)} en 30 días${topCamp ? ` · campaña «${topCamp.campaign}»` : ''}` : 'sin accesos por QR aún'} />
            </div>
        </div>
    );
}

// ── El editor ───────────────────────────────────────────────────────────────

function EditorModal({ form, setForm, error, guardando, dominio, editando, onCerrar, onGuardar }: any) {
    // Derivado, no estado: un estado paralelo se separaría del campo en cuanto
    // se abra la edición de una redirección que ya existe.
    const apuntaAlBucket = pareceObjetoDeS3(form.target);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCerrar}>
            <div
                className="bg-white rounded-3xl w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto p-8 shadow-2xl"
                onClick={e => e.stopPropagation()} role="dialog" aria-modal="true"
            >
                <div className="flex items-center justify-between mb-6">
                    <h4 className="text-lg font-bold text-gray-800">
                        {editando ? 'Editar enlace inteligente' : 'Nuevo enlace inteligente'}
                    </h4>
                    <button onClick={onCerrar} aria-label="Cerrar" className="p-2 text-gray-300 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {editando && (
                    <p className="text-xs text-emerald-700 bg-emerald-50 rounded-xl p-3 mb-5">
                        Cambiar el destino <strong>no borra las estadísticas ni invalida los códigos QR</strong>: el
                        historial y los QR cuelgan del enlace, no del texto de la dirección ni del destino.
                    </p>
                )}

                <label className="block text-xs font-semibold text-gray-500 mb-2">NOMBRE IDENTIFICADOR</label>
                <input
                    type="text" value={form.name}
                    onChange={(e: any) => setForm({ ...form, name: e.target.value })}
                    placeholder="Inscripciones Feria de Proyectos 2027"
                    maxLength={80} autoFocus
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue outline-none text-sm mb-5"
                />

                <label className="block text-xs font-semibold text-gray-500 mb-2">DIRECCIÓN CORTA</label>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-gray-400 font-mono flex-shrink-0">{dominio}</span>
                    <input
                        type="text" value={form.slug}
                        onChange={(e: any) => setForm({ ...form, slug: e.target.value })}
                        placeholder="/inscripcion"
                        className="w-full min-w-0 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue outline-none font-mono text-sm"
                    />
                </div>
                <p className="text-[11px] text-gray-400 mb-5">Sin espacios, sin acentos raros y sin la parte de la query. Es lo que va en los QR: corta y fácil de decir.</p>

                <label className="block text-xs font-semibold text-gray-500 mb-2">LLEVA A</label>
                <input
                    type="text" value={form.target}
                    onChange={(e: any) => setForm({ ...form, target: e.target.value })}
                    placeholder="https://ejemplo.org/inscripcion   o   /eventos"
                    className={`w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue outline-none text-sm ${apuntaAlBucket ? 'mb-2' : 'mb-5'}`}
                />

                {/*
                  * El destino se DICE cuando apunta directo a un objeto de S3.
                  *
                  * No bloquea —el servidor lo resuelve solo a la vía pública de
                  * la Biblioteca al servir el salto— pero conviene saberlo: una
                  * dirección de S3 lleva el nombre del archivo dentro, con sus
                  * tildes y paréntesis, y ésa es la que abría bien en el
                  * escritorio y daba «AccessDenied» en el teléfono.
                  */}
                {apuntaAlBucket && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5">
                        Este destino apunta directo al almacenamiento. Se va a servir por el
                        enlace estable de la Biblioteca de Medios, que es el que abre bien en
                        iPhone y en WhatsApp. Para copiarlo tal cual: <strong>Multimedia → el
                        archivo → Copiar enlace público</strong>.
                    </p>
                )}

                <label className="block text-xs font-semibold text-gray-500 mb-2">NOTA INTERNA (opcional)</label>
                <input
                    type="text" value={form.notes}
                    onChange={(e: any) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Para el pendón de la conferencia"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue outline-none text-sm mb-5"
                />

                <div className="space-y-3 mb-6">
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={form.forwardQuery !== false}
                            onChange={(e: any) => setForm({ ...form, forwardQuery: e.target.checked })}
                            className="rounded border-gray-300 mt-0.5" />
                        <span className="text-xs text-gray-500">
                            <strong className="text-gray-700">Pasar los parámetros al destino.</strong> Lo que venga
                            en la dirección (<code>?utm_source=…</code>) sigue viaje. Los UTM <strong>se miden igual</strong>
                            {' '}esté marcado o no: medir y reenviar son dos cosas distintas. El identificador del QR nunca se reenvía.
                        </span>
                    </label>
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" checked={form.permanent === true}
                            onChange={(e: any) => setForm({ ...form, permanent: e.target.checked })}
                            className="rounded border-gray-300 mt-0.5" />
                        <span className="text-xs text-gray-500">
                            <strong className="text-gray-700">Permanente (301).</strong> El navegador la recuerda durante
                            meses: si después la corregís, quien ya la visitó puede seguir yendo al destino viejo — y
                            <strong> sus clics dejan de contarse</strong>, porque deja de preguntar. Dejalo sin marcar
                            salvo que sepas que el destino no va a cambiar nunca. Los accesos por QR se sirven siempre
                            como temporales para poder medirlos.
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
                        {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear enlace'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Las estadísticas del enlace ─────────────────────────────────────────────

const RESULTADO: Record<string, string> = {
    redirected: 'Saltó', expired: 'QR vencido', paused: 'QR pausado', disabled: 'QR deshabilitado', deleted: 'QR eliminado',
};

function StatsModal({ link, dominio, onCerrar, onVerQr }: { link: Redirect; dominio: string; onCerrar: () => void; onVerQr: () => void }) {
    const [period, setPeriod] = useState('d30');
    const [data, setData] = useState<any>(null);
    const [audit, setAudit] = useState<any[]>([]);
    const [cargando, setCargando] = useState(true);
    const [fallo, setFallo] = useState('');
    const [filtroMedio, setFiltroMedio] = useState('');
    const [filtroCampana, setFiltroCampana] = useState('');

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

    const qrs: QrDto[] = useMemo(() => data?.qrs || [], [data]);
    const nombreQr = useMemo(() => new Map(qrs.map(q => [q.id, q.name])), [qrs]);
    const campanas = useMemo(() => [...new Set(qrs.map(q => q.campaign).filter(Boolean))], [qrs]);
    const medios = useMemo(() => [...new Set(qrs.map(q => q.medium).filter(Boolean))], [qrs]);
    const qrsFiltrados = useMemo(
        () => qrs.filter(q => (!filtroMedio || q.medium === filtroMedio) && (!filtroCampana || q.campaign === filtroCampana)),
        [qrs, filtroMedio, filtroCampana]
    );
    const porMedio = useMemo(() => {
        const m = new Map<string, number>();
        for (const q of qrsFiltrados) m.set(q.medium, (m.get(q.medium) || 0) + (q.periodScans || 0));
        return [...m].map(([k, v]) => ({ label: QR_MEDIA_SHORT[k] || k, value: v })).sort((a, b) => b.value - a.value);
    }, [qrsFiltrados]);
    const porCampana = useMemo(() => {
        const m = new Map<string, number>();
        for (const q of qrsFiltrados) if (q.campaign) m.set(q.campaign, (m.get(q.campaign) || 0) + (q.periodScans || 0));
        return [...m].map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value);
    }, [qrsFiltrados]);

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={onCerrar}>
            <div className="bg-white rounded-3xl w-full max-w-5xl my-8 p-8 shadow-2xl" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="min-w-0">
                        <h4 className="text-lg font-bold text-gray-800 truncate">{link.name || link.slug}</h4>
                        <p className="text-xs text-gray-400 font-mono truncate">{dominio}{link.slug}</p>
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
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-8">
                            <Kpi label="Accesos totales" value={numero(data.totals.clicks)} destacado />
                            <Kpi label="Por código QR" value={numero(data.totals.qrScans)} nota="accesos a la URL de un QR" />
                            <Kpi label="Enlace compartido" value={numero(data.totals.linkClicks)} nota="sin QR" />
                            <Kpi label="Visitantes únicos" value={numero(data.totals.uniqueVisitors)} nota="estimados" />
                            <Kpi label="Hoy" value={numero(data.totals.today)} />
                            <Kpi label="Últimos 7 días" value={numero(data.totals.last7)} />
                            <Kpi label="Último acceso" value={haceCuanto(data.totals.lastClickAt)} pequeno />
                        </div>

                        {data.totals.bots > 0 && (
                            <p className="text-[11px] text-gray-400 -mt-5 mb-7">
                                Además se registraron <strong>{numero(data.totals.bots)}</strong> accesos automáticos
                                (vistas previas de WhatsApp y redes, rastreadores y comprobaciones).
                                <strong> No se cuentan como accesos</strong>: no los hizo una persona.
                            </p>
                        )}

                        <Seccion titulo={`Accesos por día · ${data.period.label} · ${numero(data.totals.periodClicks)} en total, ${numero(data.totals.periodQrScans)} por QR`}>
                            <SerieBarras series={data.series} modo="split" />
                        </Seccion>

                        <Seccion
                            titulo={`Códigos QR de este enlace · ${data.period.label}`}
                            accion={
                                <button type="button" onClick={onVerQr} className="text-xs font-bold text-rotary-blue hover:underline inline-flex items-center gap-1">
                                    <QrCode className="w-3.5 h-3.5" /> Administrar QR
                                </button>
                            }
                        >
                            {qrs.length === 0 ? (
                                <p className="text-xs text-gray-400 italic">
                                    Este enlace no tiene códigos QR. Generá uno por pieza (afiche, redes, invitación) para comparar cuál trae más gente.
                                </p>
                            ) : (
                                <>
                                    {(medios.length > 1 || campanas.length > 0) && (
                                        <div className="flex flex-wrap gap-2 mb-3">
                                            {medios.length > 1 && (
                                                <select value={filtroMedio} onChange={e => setFiltroMedio(e.target.value)} aria-label="Filtrar por medio"
                                                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none">
                                                    <option value="">Todos los medios</option>
                                                    {medios.map(m => <option key={m} value={m}>{QR_MEDIA_SHORT[m] || m}</option>)}
                                                </select>
                                            )}
                                            {campanas.length > 0 && (
                                                <select value={filtroCampana} onChange={e => setFiltroCampana(e.target.value)} aria-label="Filtrar por campaña"
                                                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none">
                                                    <option value="">Todas las campañas</option>
                                                    {campanas.map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            )}
                                        </div>
                                    )}
                                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6">
                                        <div className="scroll-x-visible overflow-x-auto">
                                            <table className="min-w-max w-full text-xs">
                                                <thead>
                                                    <tr className="text-left text-[10px] uppercase text-gray-400 border-b border-gray-100">
                                                        <th className="py-2 pr-4">QR</th><th className="py-2 pr-4">Medio</th><th className="py-2 pr-4">Campaña</th>
                                                        <th className="py-2 pr-4">Estado</th>
                                                        <th className="py-2 pr-4 text-right">En el período</th>
                                                        <th className="py-2 pr-4 text-right">Total</th>
                                                        <th className="py-2 pr-4 text-right">Únicos</th>
                                                        <th className="py-2 text-right">Último</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {[...qrsFiltrados].sort((a, b) => (b.periodScans || 0) - (a.periodScans || 0)).map(q => (
                                                        <tr key={q.id}>
                                                            <td className="py-2 pr-4 font-semibold text-gray-700">{q.name}</td>
                                                            <td className="py-2 pr-4 text-gray-500">{QR_MEDIA_SHORT[q.medium] || q.medium}</td>
                                                            <td className="py-2 pr-4 text-gray-500">{q.campaign || '—'}</td>
                                                            <td className="py-2 pr-4"><EstadoPill state={q.state} texto={QR_STATE_LABELS[q.state]} /></td>
                                                            <td className="py-2 pr-4 text-right tabular-nums font-semibold text-gray-800">
                                                                {numero(q.periodScans || 0)}
                                                                {(q.periodBlocked || 0) > 0 && <span className="text-amber-700 font-normal"> +{numero(q.periodBlocked || 0)} sin saltar</span>}
                                                            </td>
                                                            <td className="py-2 pr-4 text-right tabular-nums text-gray-600">{numero(q.totalScans)}</td>
                                                            <td className="py-2 pr-4 text-right tabular-nums text-gray-500">{numero(q.uniqueVisitors)}</td>
                                                            <td className="py-2 text-right text-gray-400 whitespace-nowrap">{haceCuanto(q.lastScanAt, '—')}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div className="space-y-5">
                                            <div>
                                                <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 mb-2">Comparación entre QR</p>
                                                <Barras color="bg-amber-400" filas={[...qrsFiltrados]
                                                    .sort((a, b) => (b.periodScans || 0) - (a.periodScans || 0))
                                                    .slice(0, 8)
                                                    .map(q => ({ label: q.name, value: q.periodScans || 0 }))} />
                                            </div>
                                            {porMedio.length > 1 && (
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 mb-2">Por medio de difusión</p>
                                                    <Barras filas={porMedio} />
                                                </div>
                                            )}
                                            {porCampana.length > 0 && (
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 mb-2">Por campaña</p>
                                                    <Barras filas={porCampana} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </>
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
                                    {describeSourceEvidence()} Un escaneo desde la cámara tampoco trae referencia: por eso los QR se miden por su propio identificador.
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

                            <Seccion titulo="Ubicación aproximada (país)">
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

                        <Seccion titulo="Actividad reciente">
                            {data.recent?.length ? (
                                <div className="scroll-x-visible overflow-x-auto">
                                    <table className="min-w-max w-full text-xs">
                                        <thead>
                                            <tr className="text-left text-[10px] uppercase text-gray-400 border-b border-gray-100">
                                                <th className="py-2 pr-4">Cuándo</th><th className="py-2 pr-4">Vía</th><th className="py-2 pr-4">Resultado</th>
                                                <th className="py-2 pr-4">Fuente</th><th className="py-2 pr-4">Dispositivo</th><th className="py-2">País</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {data.recent.map((e: any, i: number) => (
                                                <tr key={i}>
                                                    <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">{fechaHora(e.createdAt)}</td>
                                                    <td className="py-2 pr-4">
                                                        {e.accessKind === 'qr'
                                                            ? <span className="inline-flex items-center gap-1 text-amber-700 font-semibold"><QrCode className="w-3 h-3" /> {nombreQr.get(e.qrId) || 'QR'}</span>
                                                            : <span className="text-gray-600">Enlace</span>}
                                                    </td>
                                                    <td className={`py-2 pr-4 ${e.outcome === 'redirected' ? 'text-emerald-700' : 'text-amber-700'}`}>{RESULTADO[e.outcome] || e.outcome}</td>
                                                    <td className="py-2 pr-4 text-gray-600">{SOURCE_LABELS[e.sourceKind] || e.sourceLabel || e.sourceKind}</td>
                                                    <td className="py-2 pr-4 text-gray-600">{DEVICE_LABELS[e.device] || e.device}{e.browser ? ` · ${e.browser}` : ''}</td>
                                                    <td className="py-2 text-gray-600">{e.country || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : <p className="text-xs text-gray-400 italic">Sin accesos en este período.</p>}
                        </Seccion>

                        {audit.length > 0 && (
                            <Seccion titulo="Historial administrativo">
                                <ul className="space-y-2">
                                    {audit.map((a, i) => (
                                        <li key={i} className="flex items-start gap-3 text-xs text-gray-500">
                                            <History className="w-3.5 h-3.5 text-gray-300 mt-0.5 flex-shrink-0" />
                                            <span>
                                                <strong className="text-gray-700">{ACCIONES[a.action] || QR_AUDIT_ACTIONS[a.action] || a.action}</strong>
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
    created: 'Creado', edited: 'Editado', paused: 'Pausado',
    activated: 'Activado', deleted: 'Eliminado', migrated: 'Importado',
};
