/**
 * Administración de Grupos de Facebook y Listas de Distribución (v4.1076.0).
 *
 * Permite:
 * 1. Validar la integración con Meta Graph API y consultar grupos vinculados.
 * 2. Explicar de manera transparente la limitación de Meta (deprecación de Groups API en abril 2024).
 * 3. Registrar e importar los grupos reales de Facebook mediante sus enlaces/nombres.
 * 4. Organizar por idioma y listas de distribución (destacando «Rotary en Español»).
 * 5. Activar/desactivar publicación autorizada por grupo.
 * 6. Guardar «Rotary en Español» como lista predeterminada.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    X, RefreshCw, Plus, ExternalLink, Trash2,
    ShieldCheck, ShieldAlert, Sparkles,
    Search, Check, Layers, Info, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { MetaGroupSyncResponse } from '../../../lib/socialShare';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
    'Content-Type': 'application/json',
});

export interface GroupItem {
    id: string;
    groupId: string;
    name: string;
    url: string | null;
    language: string;
    languageLabel: string;
    tags: string[];
    status: string;
    canPublish: boolean;
    favorite?: boolean;
    source?: string;
}

export interface GroupManagementPanelProps {
    clubId?: string | null;
    fanpageAccountName?: string | null;
    onUpdated?: () => void;
    onClose?: () => void;
    isModal?: boolean;
}

export const GroupManagementPanel: React.FC<GroupManagementPanelProps> = ({
    clubId,
    fanpageAccountName,
    onUpdated,
    onClose,
    isModal = false,
}) => {
    const [grupos, setGrupos] = useState<GroupItem[]>([]);
    const [cargando, setCargando] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const [filtroLista, setFiltroLista] = useState<string>('Todos');

    // Sincronización Meta
    const [sincronizandoMeta, setSincronizandoMeta] = useState(false);
    const [metaDiagnostic, setMetaDiagnostic] = useState<MetaGroupSyncResponse | null>(null);
    const [mostrarDiagnostic, setMostrarDiagnostic] = useState(false);

    // Alta / Importación rápida
    const [textoImportar, setTextoImportar] = useState('');
    const [importando, setImportando] = useState(false);
    const [asignarRotaryEspanol, setAsignarRotaryEspanol] = useState(true);
    const [autorizarAlImportar, setAutorizarAlImportar] = useState(true);
    const [idiomaImportacion, setIdiomaImportacion] = useState('es');

    // Lista predeterminada
    const [guardandoDefault, setGuardandoDefault] = useState(false);
    const [defaultList, setDefaultList] = useState('Rotary en Español');

    // Cargar grupos reales
    const cargarGrupos = useCallback(async () => {
        setCargando(true);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);

            const res = await fetch(`${API}/social/share/group-targets?${queryParams.toString()}`, {
                headers: authHeaders(),
            });

            if (!res.ok) throw new Error('No se pudieron consultar los grupos.');
            const data = await res.json();
            setGrupos(data.groups || []);
            if (data.defaultList) setDefaultList(data.defaultList);
        } catch (e: any) {
            console.warn('[groupMgmt] error al cargar:', e.message);
        } finally {
            setCargando(false);
        }
    }, [clubId]);

    useEffect(() => {
        cargarGrupos();
    }, [cargarGrupos]);

    // Ejecutar sincronización con Meta
    const sincronizarConMeta = async () => {
        setSincronizandoMeta(true);
        setMetaDiagnostic(null);
        setMostrarDiagnostic(true);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);

            const res = await fetch(`${API}/social/share/groups/sync-meta?${queryParams.toString()}`, {
                method: 'POST',
                headers: authHeaders(),
            });

            const data: MetaGroupSyncResponse = await res.json();
            setMetaDiagnostic(data);

            if (data.ok && data.synced > 0) {
                toast.success(data.message || 'Grupos sincronizados desde Meta');
                await cargarGrupos();
                if (onUpdated) onUpdated();
            } else {
                toast(data.message || 'Validación de Meta completada', { icon: 'ℹ️' });
            }
        } catch (err: any) {
            toast.error(err.message || 'Error al validar con Meta API');
        } finally {
            setSincronizandoMeta(false);
        }
    };

    // Importar grupos reales
    const ejecutarImportacion = async () => {
        if (!textoImportar.trim()) {
            toast.error('Pega al menos un enlace o nombre de grupo.');
            return;
        }

        setImportando(true);
        try {
            const lineas = textoImportar.split('\n').map(l => l.trim()).filter(Boolean);
            const lineasTransformadas = lineas.map(line => {
                const tagsToAdd: string[] = [];
                if (asignarRotaryEspanol) tagsToAdd.push('Rotary en Español');
                if (idiomaImportacion === 'es') tagsToAdd.push('Español');
                else if (idiomaImportacion === 'en') tagsToAdd.push('English');

                if (tagsToAdd.length > 0) {
                    return `${line} | tags:${tagsToAdd.join(',')}`;
                }
                return line;
            }).join('\n');

            const res = await fetch(`${API}/distribution/groups/import`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    text: lineasTransformadas,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudieron importar los grupos.');

            toast.success(`${data.creados || 0} grupos registrados · ${data.actualizados || 0} actualizados`);
            setTextoImportar('');

            await cargarGrupos();

            if (autorizarAlImportar && data.groups) {
                const nuevostargetIds = new Set(data.groups.map((g: any) => g.rowId || g.id));
                for (const g of data.groups) {
                    if (nuevostargetIds.has(g.rowId) && g.status !== 'verificado') {
                        await fetch(`${API}/distribution/groups/${g.rowId}/status`, {
                            method: 'POST',
                            headers: authHeaders(),
                            body: JSON.stringify({ status: 'verificado' }),
                        }).catch(() => {});
                    }
                }
                await cargarGrupos();
            }

            if (onUpdated) onUpdated();
        } catch (err: any) {
            toast.error(err.message || 'Error al importar grupos.');
        } finally {
            setImportando(false);
        }
    };

    // Alternar asignación a lista Rotary en Español
    const toggleRotaryEspanol = async (g: GroupItem) => {
        const tieneLista = g.tags.includes('Rotary en Español');
        const nuevasTags = tieneLista
            ? g.tags.filter(t => t !== 'Rotary en Español')
            : [...g.tags, 'Rotary en Español'];

        try {
            await fetch(`${API}/distribution/groups/${g.id}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({ tags: nuevasTags }),
            });

            setGrupos(prev => prev.map(item => item.id === g.id ? { ...item, tags: nuevasTags } : item));
            toast.success(tieneLista ? 'Grupo quitado de Rotary en Español' : 'Grupo asignado a Rotary en Español 🌎');
            if (onUpdated) onUpdated();
        } catch {
            toast.error('No se pudo actualizar la lista del grupo.');
        }
    };

    // Cambiar estado de autorización
    const toggleAutorizado = async (g: GroupItem) => {
        const nuevoStatus = g.status === 'verificado' ? 'sin_permiso' : 'verificado';
        try {
            const res = await fetch(`${API}/distribution/groups/${g.id}/status`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ status: nuevoStatus }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo cambiar el estado.');

            setGrupos(prev => prev.map(item => item.id === g.id ? {
                ...item,
                status: nuevoStatus,
                canPublish: nuevoStatus === 'verificado',
            } : item));

            toast.success(nuevoStatus === 'verificado' ? 'Grupo autorizado para publicación' : 'Grupo desactivado');
            if (onUpdated) onUpdated();
        } catch (err: any) {
            toast.error(err.message || 'Error al actualizar estado.');
        }
    };

    // Eliminar grupo
    const eliminarGrupo = async (g: GroupItem) => {
        if (!window.confirm(`¿Quitar «${g.name}» de la lista de grupos?\nEsto no afectará tu membresía en Facebook.`)) return;
        try {
            const res = await fetch(`${API}/distribution/groups/${g.id}`, {
                method: 'DELETE',
                headers: authHeaders(),
            });
            if (!res.ok) throw new Error('No se pudo eliminar el grupo.');

            setGrupos(prev => prev.filter(item => item.id !== g.id));
            toast.success('Grupo eliminado');
            if (onUpdated) onUpdated();
        } catch (err: any) {
            toast.error(err.message || 'Error al eliminar grupo.');
        }
    };

    // Guardar lista Rotary en Español como predeterminada
    const guardarListaPredeterminada = async () => {
        setGuardandoDefault(true);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);

            const res = await fetch(`${API}/social/share/groups/default-list?${queryParams.toString()}`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ listName: 'Rotary en Español' }),
            });

            if (!res.ok) throw new Error('No se pudo guardar la lista predeterminada.');
            setDefaultList('Rotary en Español');
            toast.success('«Rotary en Español» guardada como lista predeterminada ✨');
            if (onUpdated) onUpdated();
        } catch (err: any) {
            toast.error(err.message || 'Error al guardar lista predeterminada.');
        } finally {
            setGuardandoDefault(false);
        }
    };

    // Grupos filtrados
    const gruposFiltrados = useMemo(() => {
        return grupos.filter(g => {
            if (filtroLista === 'Rotary en Español') {
                if (!g.tags.includes('Rotary en Español')) return false;
            } else if (filtroLista === 'Autorizados') {
                if (g.status !== 'verificado') return false;
            }

            if (busqueda.trim()) {
                const q = busqueda.toLowerCase().trim();
                const matchName = g.name.toLowerCase().includes(q);
                const matchTags = g.tags.some(t => t.toLowerCase().includes(q));
                if (!matchName && !matchTags) return false;
            }

            return true;
        });
    }, [grupos, filtroLista, busqueda]);

    const countRotaryEspanol = useMemo(() => {
        return grupos.filter(g => g.tags.includes('Rotary en Español')).length;
    }, [grupos]);

    const countAutorizados = useMemo(() => {
        return grupos.filter(g => g.status === 'verificado').length;
    }, [grupos]);

    return (
        <div className={`flex flex-col overflow-hidden text-gray-800 ${isModal ? 'h-full max-h-[92vh]' : 'bg-white rounded-3xl border border-gray-100 shadow-sm'}`}>
            {/* Cabecera */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50/80 to-white shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 bg-blue-50 text-rotary-blue rounded-2xl">
                        <Layers className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-base font-black text-gray-900 truncate">
                                Administración de Grupos de Facebook
                            </h3>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100/70 text-blue-800">
                                {fanpageAccountName || 'Fanpage oficial'}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                            Sincronización con Meta, listas de distribución por idioma y autorización
                        </p>
                    </div>
                </div>

                {onClose && isModal && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}
            </div>

                {/* Contenido principal scrollable */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
                    {/* Barra de Integración con Meta Graph API */}
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50/50 via-white to-indigo-50/30 border border-blue-100/80 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                                    <span className="font-bold text-gray-900 text-sm">
                                        Integración con Meta Graph API
                                    </span>
                                </div>
                                <p className="text-gray-500 leading-relaxed text-xs">
                                    Consulta si Meta expone grupos vinculados a la Fanpage con los permisos actuales.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={sincronizarConMeta}
                                disabled={sincronizandoMeta}
                                className="px-4 py-2 rounded-xl font-bold bg-white text-blue-700 border border-blue-200 hover:bg-blue-50/80 shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                            >
                                {sincronizandoMeta ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                                        Validando con Meta...
                                    </>
                                ) : (
                                    <>
                                        <RefreshCw className="w-4 h-4" />
                                        Sincronizar con Meta
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Diagnóstico transparente de Meta */}
                        {mostrarDiagnostic && metaDiagnostic && (
                            <div className="mt-3 p-3.5 bg-white border border-blue-200 rounded-xl text-xs space-y-2 animate-in fade-in duration-150">
                                <div className="flex items-start gap-2.5">
                                    <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="font-bold text-gray-900">
                                            {metaDiagnostic.synced > 0 ? 'Grupos sincronizados con éxito' : 'Política oficial de Meta Graph API'}
                                        </p>
                                        <p className="text-gray-600 leading-relaxed">
                                            {metaDiagnostic.message}
                                        </p>
                                        {metaDiagnostic.diagnostic && (
                                            <div className="p-2.5 bg-gray-50 rounded-lg text-[11px] text-gray-500 space-y-0.5 border border-gray-100 mt-1">
                                                <p><strong>Página conectada:</strong> {metaDiagnostic.diagnostic.fanpage}</p>
                                                <p><strong>Nota técnica:</strong> {metaDiagnostic.diagnostic.metaNotice}</p>
                                                <p><strong>Solución:</strong> {metaDiagnostic.diagnostic.solution}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Registro e importación rápida de grupos reales */}
                    <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-200/80 space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="font-bold text-gray-900 flex items-center gap-1.5">
                                <Plus className="w-4 h-4 text-rotary-blue" />
                                Registrar grupos reales de Facebook
                            </span>
                            <span className="text-[11px] text-gray-400">
                                Puedes pegar los 36 grupos de tu cuenta
                            </span>
                        </div>

                        <textarea
                            value={textoImportar}
                            onChange={(e) => setTextoImportar(e.target.value)}
                            rows={3}
                            placeholder="Pega enlaces o nombres de grupos (uno por línea):&#10;https://www.facebook.com/groups/rotarycolombia&#10;Rotarios de Colombia | https://www.facebook.com/groups/rotarioslatam"
                            className="w-full p-3 rounded-xl border border-gray-200 bg-white text-xs font-mono text-gray-900 focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-none transition-all placeholder:text-gray-400"
                        />

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                            <div className="flex items-center gap-4 flex-wrap">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={asignarRotaryEspanol}
                                        onChange={(e) => setAsignarRotaryEspanol(e.target.checked)}
                                        className="w-4 h-4 rounded text-rotary-blue focus:ring-rotary-blue border-gray-300 cursor-pointer"
                                    />
                                    <span className="text-gray-700 font-medium text-xs">
                                        Asignar a lista <strong>«Rotary en Español»</strong>
                                    </span>
                                </label>

                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={autorizarAlImportar}
                                        onChange={(e) => setAutorizarAlImportar(e.target.checked)}
                                        className="w-4 h-4 rounded text-rotary-blue focus:ring-rotary-blue border-gray-300 cursor-pointer"
                                    />
                                    <span className="text-gray-700 font-medium text-xs">
                                        Autorizar para publicación inmediata
                                    </span>
                                </label>

                                <div className="flex items-center gap-1.5">
                                    <span className="text-gray-500 text-xs">Idioma:</span>
                                    <select
                                        value={idiomaImportacion}
                                        onChange={(e) => setIdiomaImportacion(e.target.value)}
                                        className="py-1 px-2 text-xs rounded-lg border border-gray-200 bg-white font-medium text-gray-700"
                                    >
                                        <option value="es">Español</option>
                                        <option value="en">English</option>
                                    </select>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={ejecutarImportacion}
                                disabled={importando || !textoImportar.trim()}
                                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rotary-blue hover:bg-rotary-navy disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-all flex items-center gap-2 cursor-pointer"
                            >
                                {importando ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Registrando...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-3.5 h-3.5" />
                                        Registrar grupos
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Listado y Organización de Grupos */}
                    <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => setFiltroLista('Todos')}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                        filtroLista === 'Todos'
                                            ? 'bg-gray-900 text-white shadow-xs'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    Todos ({grupos.length})
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setFiltroLista('Rotary en Español')}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                        filtroLista === 'Rotary en Español'
                                            ? 'bg-blue-600 text-white shadow-xs'
                                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                    }`}
                                >
                                    <span>Rotary en Español</span>
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-mono">
                                        {countRotaryEspanol}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setFiltroLista('Autorizados')}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                        filtroLista === 'Autorizados'
                                            ? 'bg-emerald-600 text-white shadow-xs'
                                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                    }`}
                                >
                                    <span>Autorizados</span>
                                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-mono">
                                        {countAutorizados}
                                    </span>
                                </button>
                            </div>

                            {/* Guardar lista predeterminada */}
                            <button
                                type="button"
                                onClick={guardarListaPredeterminada}
                                disabled={guardandoDefault}
                                className="px-3 py-1.5 text-xs font-bold text-gray-700 hover:text-blue-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                            >
                                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                {guardandoDefault ? 'Guardando...' : 'Fijar «Rotary en Español» como predeterminada'}
                            </button>
                        </div>

                        {/* Buscador */}
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={busqueda}
                                onChange={(e) => setBusqueda(e.target.value)}
                                placeholder="Buscar grupo por nombre o etiqueta..."
                                className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-white text-xs text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-none"
                            />
                        </div>

                        {/* Tabla / Tarjetas de grupos */}
                        {cargando ? (
                            <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                                <Loader2 className="w-6 h-6 animate-spin text-rotary-blue" />
                                <p className="text-xs">Cargando grupos registrados...</p>
                            </div>
                        ) : gruposFiltrados.length === 0 ? (
                            <div className="py-12 text-center border border-dashed border-gray-200 rounded-2xl p-6 space-y-2">
                                <p className="text-gray-500 font-bold">
                                    No hay grupos registrados {filtroLista !== 'Todos' ? `en el filtro «${filtroLista}»` : ''}.
                                </p>
                                <p className="text-gray-400 text-[11px] max-w-md mx-auto">
                                    Pega los enlaces de tus 36 grupos de Facebook en la sección superior para comenzar a administrarlos y asignarlos a tus listas.
                                </p>
                            </div>
                        ) : (
                            <div className="border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100 bg-white shadow-xs">
                                {gruposFiltrados.map((g) => {
                                    const enRotaryEspanol = g.tags.includes('Rotary en Español');
                                    const autorizado = g.status === 'verificado';

                                    return (
                                        <div
                                            key={g.id}
                                            className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-gray-50/50 transition-colors"
                                        >
                                            <div className="min-w-0 flex items-start gap-3">
                                                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                                                    f
                                                </div>
                                                <div className="min-w-0 space-y-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className="font-bold text-gray-900 text-xs truncate">
                                                            {g.name}
                                                        </p>
                                                        {g.url && (
                                                            <a
                                                                href={g.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-gray-400 hover:text-blue-600 transition-colors"
                                                                title="Ver en Facebook"
                                                            >
                                                                <ExternalLink className="w-3 h-3" />
                                                            </a>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-2 flex-wrap text-[11px]">
                                                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                                                            {g.languageLabel || 'Español'}
                                                        </span>

                                                        {enRotaryEspanol ? (
                                                            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200/60 flex items-center gap-1">
                                                                <Check className="w-3 h-3" />
                                                                Rotary en Español
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-400">
                                                                Sin lista asignada
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Controles de acción por grupo */}
                                            <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                                                {/* Toggle Rotary en Español */}
                                                <button
                                                    type="button"
                                                    onClick={() => toggleRotaryEspanol(g)}
                                                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                                                        enRotaryEspanol
                                                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {enRotaryEspanol ? (
                                                        <>
                                                            <Check className="w-3 h-3" /> En Rotary Español
                                                        </>
                                                    ) : (
                                                        '+ Asignar a Rotary Español'
                                                    )}
                                                </button>

                                                {/* Toggle Autorizado */}
                                                <button
                                                    type="button"
                                                    onClick={() => toggleAutorizado(g)}
                                                    className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                                                        autorizado
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                                            : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                                    }`}
                                                >
                                                    {autorizado ? (
                                                        <>
                                                            <ShieldCheck className="w-3 h-3 text-emerald-600" /> Autorizado
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ShieldAlert className="w-3 h-3 text-amber-600" /> Sin permiso
                                                        </>
                                                    )}
                                                </button>

                                                {/* Eliminar */}
                                                <button
                                                    type="button"
                                                    onClick={() => eliminarGrupo(g)}
                                                    className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                                    title="Eliminar grupo"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Pie del modal/panel */}
                <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-100 flex items-center justify-between shrink-0 text-xs">
                    <span className="text-gray-500 font-medium">
                        Total: <strong>{grupos.length} grupos</strong> ({countRotaryEspanol} en Rotary en Español)
                    </span>
                    {onClose && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-5 py-2 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-colors cursor-pointer shadow-xs"
                        >
                            Listo
                        </button>
                    )}
                </div>
        </div>
    );
};

export interface GroupManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
    clubId?: string | null;
    fanpageAccountName?: string | null;
    onUpdated?: () => void;
}

export const GroupManagementModal: React.FC<GroupManagementModalProps> = ({
    isOpen,
    onClose,
    clubId,
    fanpageAccountName,
    onUpdated,
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden text-gray-800">
                <GroupManagementPanel
                    clubId={clubId}
                    fanpageAccountName={fanpageAccountName}
                    onUpdated={onUpdated}
                    onClose={onClose}
                    isModal={true}
                />
            </div>
        </div>
    );
};

export default GroupManagementModal;
