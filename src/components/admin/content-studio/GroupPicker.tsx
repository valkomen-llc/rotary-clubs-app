/**
 * El panel de grupos — columna derecha de la Distribución.
 *
 * v4.876. Buscador, filtros, casillas, seleccionar todos, favoritos, listas,
 * paginación, importar y exportar.
 *
 * ⚠️ EL FILTRO Y LA PAGINACIÓN LOS RESUELVE EL SERVIDOR. No es una preferencia:
 * es lo que hace que «Todos» seleccione exactamente lo que se está viendo. Con
 * el filtro implementado también acá, marcar todos elegiría grupos fuera de la
 * vista — la forma más cara de equivocarse en este módulo.
 *
 * ⚠️ Y NINGÚN GRUPO SE DETECTA. Meta retiró la API de Grupos entera el 22 de
 * abril de 2024, también la lectura: no hay endpoint que preguntar. La lista se
 * declara una vez, y la pantalla lo dice en vez de fingir una búsqueda.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Search, Star, Upload, Download, Plus, Trash2, Loader2,
    ShieldCheck, ShieldAlert, ExternalLink, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { MANUAL_NOTICE, MIS_GRUPOS_URL, TONE_CLASS } from '../../../lib/distributionSpec';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('rotary_token')}` });
const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });

export type GroupRow = {
    rowId: string; targetId: string; targetName: string; targetUrl: string | null;
    targetType: 'group_manual'; socialAccountId: string | null;
    status: string; canPublish: boolean; favorite: boolean;
    tags: string[]; lastPublishedAt: string | null; key: string;
};
type EstadoUI = { label: string; tone: keyof typeof TONE_CLASS; canPublish: boolean; reason: string | null };

type Props = {
    accountId: string;
    selected: string[];
    onToggle: (g: GroupRow) => void;
    onSelectMany: (gs: GroupRow[]) => void;
    onClear: () => void;
};

const fmtFecha = (iso: string | null) => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }); }
    catch { return null; }
};

const GroupPicker: React.FC<Props> = ({ accountId, selected, onToggle, onSelectMany, onClear }) => {
    const [grupos, setGrupos] = useState<GroupRow[]>([]);
    const [estados, setEstados] = useState<Record<string, EstadoUI>>({});
    const [listas, setListas] = useState<Array<{ tag: string; count: number }>>([]);
    const [pagina, setPagina] = useState(1);
    const [paginas, setPaginas] = useState(1);
    const [total, setTotal] = useState(0);
    const [totalAll, setTotalAll] = useState(0);
    const [verificados, setVerificados] = useState(0);
    const [q, setQ] = useState('');
    const [tag, setTag] = useState('');
    const [estado, setEstado] = useState('');
    const [soloFavoritos, setSoloFavoritos] = useState(false);
    const [porCuenta, setPorCuenta] = useState(true);
    const [cargando, setCargando] = useState(false);
    const [declarando, setDeclarando] = useState(false);
    const [pegado, setPegado] = useState('');

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const params = new URLSearchParams({ page: String(pagina) });
            if (q.trim()) params.set('q', q.trim());
            if (tag) params.set('tag', tag);
            if (estado) params.set('status', estado);
            if (soloFavoritos) params.set('favorites', '1');
            // Filtrar por cuenta es una ELECCIÓN visible, no algo implícito: los
            // grupos declarados antes de que existiera la columna no tienen
            // cuenta, y esconderlos por omisión los haría desaparecer.
            if (porCuenta && accountId) params.set('accountId', accountId);
            const r = await fetch(`${API}/distribution/groups?${params}`, { headers: authHeaders() });
            if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudieron cargar los grupos');
            const d = await r.json();
            setGrupos(d.groups || []);
            setEstados(d.states || {});
            setListas(d.lists || []);
            setPaginas(d.pages || 1);
            setTotal(d.total || 0);
            setTotalAll(d.totalAll || 0);
            setVerificados(d.verificados || 0);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al cargar los grupos');
        } finally { setCargando(false); }
    }, [pagina, q, tag, estado, soloFavoritos, porCuenta, accountId]);

    useEffect(() => { cargar(); }, [cargar]);
    // Cambiar de filtro vuelve a la primera página: quedarse en la 4 de una
    // búsqueda que ahora tiene una sola página muestra un panel vacío.
    useEffect(() => { setPagina(1); }, [q, tag, estado, soloFavoritos, porCuenta, accountId]);

    const importar = useCallback(async (texto: string) => {
        if (!texto.trim()) { toast.error('Pegá al menos un grupo.'); return; }
        setDeclarando(true);
        try {
            const r = await fetch(`${API}/distribution/groups/import`, {
                method: 'POST', headers: jsonHeaders(),
                body: JSON.stringify({ text: texto, accountId: accountId || null }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || 'No se pudo importar');
            const notas = [
                d.creados ? `${d.creados} agregados` : null,
                d.actualizados ? `${d.actualizados} actualizados` : null,
                d.skipped?.length ? `${d.skipped.length} sin interpretar` : null,
            ].filter(Boolean).join(' · ');
            toast.success(notas || 'Listo');
            setPegado('');
            await cargar();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al importar');
        } finally { setDeclarando(false); }
    }, [accountId, cargar]);

    const subirArchivo = useCallback(async (file: File) => {
        const texto = await file.text();
        await importar(texto);
    }, [importar]);

    const cambiarEstado = useCallback(async (g: GroupRow, status: string) => {
        try {
            const r = await fetch(`${API}/distribution/groups/${g.rowId}/status`, {
                method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ status }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.error || 'No se pudo cambiar el estado');
            await cargar();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error');
        }
    }, [cargar]);

    const alternarFavorito = useCallback(async (g: GroupRow) => {
        try {
            await fetch(`${API}/distribution/groups/${g.rowId}`, {
                method: 'PATCH', headers: jsonHeaders(), body: JSON.stringify({ favorite: !g.favorite }),
            });
            await cargar();
        } catch { toast.error('No se pudo marcar como favorito'); }
    }, [cargar]);

    const quitar = useCallback(async (g: GroupRow) => {
        if (!window.confirm(`Quitar «${g.targetName}» de la lista de destinos?\n\nEsto no toca nada en Facebook: sólo lo saca de acá.`)) return;
        try {
            await fetch(`${API}/distribution/groups/${g.rowId}`, { method: 'DELETE', headers: authHeaders() });
            await cargar();
        } catch { toast.error('No se pudo quitar'); }
    }, [cargar]);

    const sinVerificar = useMemo(() => totalAll - verificados, [totalAll, verificados]);
    const filtrando = !!(q.trim() || tag || estado || soloFavoritos);

    return (
        <div data-testid="group-picker" className="bg-white rounded-2xl border border-gray-100 shadow-sm flex flex-col max-h-[calc(100vh-8rem)]">
            <div className="p-5 border-b border-gray-100 space-y-3">
                <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-black text-gray-900">Grupos de Facebook</h3>
                    <span className="text-[11px] text-gray-400 tabular-nums">{selected.length} elegidos</span>
                </div>

                {/* El estado de la lista, arriba y de un vistazo. Un panel que no
                    dice cuántos están sin verificar deja el bloqueo para la
                    sorpresa del momento de programar. */}
                {totalAll > 0 && (
                    <p className="text-[11px] text-gray-500">
                        {totalAll} declarados · <span className="text-emerald-700 font-bold">{verificados} verificados</span>
                        {sinVerificar > 0 && <> · <span className="text-amber-700 font-bold">{sinVerificar} sin verificar</span></>}
                    </p>
                )}

                <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, id o lista…"
                        className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2" />
                </div>

                <div className="flex flex-wrap gap-1.5">
                    <select value={estado} onChange={e => setEstado(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5" aria-label="Filtrar por estado">
                        <option value="">Todos los estados</option>
                        {Object.entries(estados).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <button onClick={() => setSoloFavoritos(v => !v)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 ${soloFavoritos ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                        <Star className="w-3.5 h-3.5" /> Favoritos
                    </button>
                    {accountId && (
                        <button onClick={() => setPorCuenta(v => !v)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${porCuenta ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                            {porCuenta ? 'De esta cuenta' : 'Todas las cuentas'}
                        </button>
                    )}
                </div>

                {listas.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-gray-400 self-center">Listas</span>
                        {listas.map(l => (
                            <button key={l.tag} onClick={() => setTag(t => t === l.tag ? '' : l.tag)}
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold ${tag === l.tag ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                                {l.tag} <span className="opacity-60 tabular-nums">{l.count}</span>
                            </button>
                        ))}
                    </div>
                )}

                <div className="flex items-center gap-2 text-xs">
                    {/* «Todos» opera sobre lo FILTRADO de esta página, y el rótulo
                        lo dice: seleccionar a ciegas grupos que no se están
                        viendo es cómo se publica donde no se quería. */}
                    <button onClick={() => onSelectMany(grupos.filter(g => g.canPublish))}
                        className="font-bold text-indigo-600 hover:text-indigo-700">
                        Elegir los {grupos.filter(g => g.canPublish).length} de esta página
                    </button>
                    <span className="text-gray-300">·</span>
                    <button onClick={onClear} className="font-bold text-gray-500 hover:text-gray-700">Ninguno</button>
                    {filtrando && <span className="text-gray-400 ml-auto tabular-nums">{total} coinciden</span>}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
                {cargando && <p className="p-6 text-sm text-gray-400">Cargando…</p>}
                {!cargando && !grupos.length && (
                    <div className="p-6 text-sm text-gray-500 space-y-2">
                        <p className="font-bold text-gray-700">{filtrando ? 'Ningún grupo coincide con el filtro.' : 'Todavía no hay grupos declarados.'}</p>
                        {!filtrando && <p className="text-xs">{MANUAL_NOTICE}</p>}
                    </div>
                )}
                {grupos.map(g => {
                    const ui = estados[g.status];
                    const elegido = selected.includes(g.targetId);
                    const ultima = fmtFecha(g.lastPublishedAt);
                    return (
                        <div key={g.rowId} className={`p-3 flex items-start gap-3 ${elegido ? 'bg-indigo-50/60' : ''}`}>
                            <input
                                type="checkbox" checked={elegido} disabled={!g.canPublish}
                                onChange={() => onToggle(g)}
                                aria-label={`Elegir: ${g.targetName}`}
                                className="mt-1 flex-none disabled:opacity-30"
                            />
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-sm text-gray-800 truncate">{g.targetName}</span>
                                    {ui && (
                                        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${TONE_CLASS[ui.tone]}`}>
                                            {ui.label}
                                        </span>
                                    )}
                                    {g.tags.map(t => (
                                        <span key={t} className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{t}</span>
                                    ))}
                                </div>
                                <p className="text-[11px] text-gray-400 font-mono truncate">{g.targetId}</p>
                                {ultima && <p className="text-[11px] text-gray-500">Última publicación: {ultima}</p>}
                                {!g.canPublish && ui?.reason && <p className="text-[11px] text-amber-700 mt-0.5">{ui.reason}</p>}
                            </div>
                            <div className="flex items-center gap-1 flex-none">
                                <button onClick={() => alternarFavorito(g)} aria-label={`Favorito: ${g.targetName}`}
                                    className={g.favorite ? 'text-amber-500' : 'text-gray-300 hover:text-gray-400'}>
                                    <Star className="w-4 h-4" fill={g.favorite ? 'currentColor' : 'none'} />
                                </button>
                                {g.targetUrl && (
                                    <a href={g.targetUrl} target="_blank" rel="noopener noreferrer"
                                       className="text-gray-300 hover:text-indigo-600" aria-label={`Abrir ${g.targetName}`}>
                                        <ExternalLink className="w-4 h-4" />
                                    </a>
                                )}
                                {g.canPublish ? (
                                    <button onClick={() => cambiarEstado(g, 'sin_verificar')} aria-label={`Quitar verificación: ${g.targetName}`}
                                        className="text-emerald-600 hover:text-emerald-700"><ShieldCheck className="w-4 h-4" /></button>
                                ) : (
                                    <button onClick={() => cambiarEstado(g, 'verificado')} aria-label={`Verificar: ${g.targetName}`}
                                        className="text-gray-400 hover:text-emerald-600"><ShieldAlert className="w-4 h-4" /></button>
                                )}
                                <button onClick={() => quitar(g)} aria-label={`Quitar: ${g.targetName}`}
                                    className="text-gray-300 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {paginas > 1 && (
                <div className="p-3 border-t border-gray-100 flex items-center justify-center gap-1">
                    <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina === 1}
                        className="px-2 py-1 rounded text-xs font-bold text-gray-600 disabled:opacity-30">«</button>
                    <span className="text-xs text-gray-500 tabular-nums px-2">{pagina} / {paginas}</span>
                    <button onClick={() => setPagina(p => Math.min(paginas, p + 1))} disabled={pagina === paginas}
                        className="px-2 py-1 rounded text-xs font-bold text-gray-600 disabled:opacity-30">»</button>
                </div>
            )}

            <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl space-y-3">
                <details open={!totalAll}>
                    <summary className="cursor-pointer text-sm font-bold text-gray-700">Declarar grupos</summary>
                    <p className="text-xs text-gray-500 mt-2">
                        <strong>Meta no dice en qué grupos está una cuenta.</strong> Retiró la API de Grupos el 22 de abril de 2024, también la lectura, así que la lista se declara una vez.{' '}
                        <a href={MIS_GRUPOS_URL} target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold">Ver mis grupos</a>.
                    </p>
                    <textarea
                        value={pegado} onChange={e => setPegado(e.target.value)} rows={3}
                        placeholder={'Rotary Colombia | https://facebook.com/groups/123456\nhttps://facebook.com/groups/rotary-4281'}
                        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 font-mono mt-2"
                    />
                    <button onClick={() => importar(pegado)} disabled={declarando}
                        className="mt-2 px-3 py-1.5 bg-gray-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 disabled:opacity-40">
                        {declarando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Agregar
                    </button>
                </details>

                <div className="flex flex-wrap gap-2 pt-1">
                    <label className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 flex items-center gap-1.5 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" /> Importar
                        <input type="file" accept=".csv,.json,.txt" className="hidden"
                            onChange={e => {
                                const f = e.target.files?.[0];
                                // Se limpia el input: sin esto, volver a elegir el
                                // MISMO archivo no dispara `change` y el botón
                                // parece roto justo al reintentar.
                                e.target.value = '';
                                if (f) subirArchivo(f);
                            }} />
                    </label>
                    <a href={`${API}/distribution/groups/export?format=csv`}
                       className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 flex items-center gap-1.5">
                        <Download className="w-3.5 h-3.5" /> CSV
                    </a>
                    <a href={`${API}/distribution/groups/export?format=json`}
                       className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-700 flex items-center gap-1.5">
                        <Download className="w-3.5 h-3.5" /> JSON
                    </a>
                </div>
                {/* Importar NO autoriza: es la regla del pedido y hay que decirla
                    donde está el botón, no en la documentación. */}
                <p className="text-[11px] text-gray-500 flex gap-1.5">
                    <Info className="w-3.5 h-3.5 flex-none mt-0.5" />
                    Importar no autoriza nada: todo grupo entra <strong>sin verificar</strong> y hay que confirmarlo antes de programarle algo.
                </p>
            </div>
        </div>
    );
};

export default GroupPicker;
