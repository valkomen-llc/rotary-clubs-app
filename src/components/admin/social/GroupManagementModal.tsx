/**
 * Administración de Grupos de Facebook y Listas de Distribución Personalizadas (v4.1077.0).
 *
 * Características principales:
 * 1. Visualización y gestión de los 36 grupos reales vinculados a la cuenta.
 * 2. Carga/Semillero con 1 clic de los grupos reales de la cuenta.
 * 3. CRUD completo de Listas de Distribución Personalizadas (crear, editar, eliminar, default).
 * 4. Validador en vivo de URLs de grupos de Facebook.
 * 5. Asignación masiva y selección múltiple de grupos a listas.
 * 6. Configuración de distribución por lotes seguros anti-spam de Meta.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    X, RefreshCw, Plus, ExternalLink, Trash2,
    ShieldCheck, ShieldAlert, Sparkles,
    Search, Check, Layers, Info, Loader2,
    Download, Settings2, Edit3, Bookmark, Tag, AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { MetaGroupSyncResponse, CustomDistributionList, BatchDistributionConfig } from '../../../lib/socialShare';

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
    // Pestaña activa del administrador
    const [tabActiva, setTabActiva] = useState<'grupos' | 'listas' | 'seguridad'>('grupos');

    // Grupos
    const [grupos, setGrupos] = useState<GroupItem[]>([]);
    const [cargando, setCargando] = useState(false);
    const [cargandoSeed, setCargandoSeed] = useState(false);
    const [busqueda, setBusqueda] = useState('');
    const [filtroLista, setFiltroLista] = useState<string>('Todos');

    // Selección múltiple para acciones en lote
    const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set());

    // Listas de distribución personalizadas
    const [customLists, setCustomLists] = useState<CustomDistributionList[]>([]);
    const [defaultList, setDefaultList] = useState('Rotary en Español');
    const [cargandoListas, setCargandoListas] = useState(false);

    // Modal / Formulario de creación/edición de lista
    const [mostrarModalLista, setMostrarModalLista] = useState(false);
    const [listaEditando, setListaEditando] = useState<CustomDistributionList | null>(null);
    const [nombreListaForm, setNombreListaForm] = useState('');
    const [descListaForm, setDescListaForm] = useState('');
    const [colorListaForm, setColorListaForm] = useState('blue');
    const [guardandoLista, setGuardandoLista] = useState(false);

    // Configuración de lotes
    const [batchSize, setBatchSize] = useState(5);
    const [guardandoBatch, setGuardandoBatch] = useState(false);

    // Sincronización Meta
    const [sincronizandoMeta, setSincronizandoMeta] = useState(false);
    const [metaDiagnostic, setMetaDiagnostic] = useState<MetaGroupSyncResponse | null>(null);
    const [mostrarDiagnostic, setMostrarDiagnostic] = useState(false);

    // Registro manual / URL validator
    const [urlManual, setUrlManual] = useState('');
    const [validandoUrl, setValidandoUrl] = useState(false);
    const [urlValidadaInfo, setUrlValidadaInfo] = useState<any | null>(null);
    const [listasSeleccionadasNuevo, setListasSeleccionadasNuevo] = useState<string[]>(['Rotary en Español']);
    const [registrandoNuevo, setRegistrandoNuevo] = useState(false);

    // Evitar auto-seed duplicado
    const autoSeedEjecutado = useRef(false);

    // Cargar listas personalizadas
    const cargarListas = useCallback(async () => {
        setCargandoListas(true);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);
            const res = await fetch(`${API}/social/share/groups/custom-lists?${queryParams.toString()}`, {
                headers: authHeaders(),
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.lists)) setCustomLists(data.lists);
                if (data.defaultList) setDefaultList(data.defaultList);
            }
        } catch (e) {
            console.warn('[groupMgmt] error al cargar listas:', e);
        } finally {
            setCargandoListas(false);
        }
    }, [clubId]);

    // Cargar configuración de lotes
    const cargarBatchConfig = useCallback(async () => {
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);
            const res = await fetch(`${API}/social/share/groups/batch-config?${queryParams.toString()}`, {
                headers: authHeaders(),
            });
            if (res.ok) {
                const data: BatchDistributionConfig = await res.json();
                if (data.batchSize) setBatchSize(data.batchSize);
            }
        } catch (e) {
            console.warn('[groupMgmt] error batch-config:', e);
        }
    }, [clubId]);

    // Cargar grupos reales
    const cargarGrupos = useCallback(async (autoSeedSiVacio = true) => {
        setCargando(true);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);

            const res = await fetch(`${API}/social/share/group-targets?${queryParams.toString()}`, {
                headers: authHeaders(),
            });

            if (!res.ok) throw new Error('No se pudieron consultar los grupos.');
            const data = await res.json();
            const groupsFound: GroupItem[] = data.groups || [];

            // Si la base de datos está vacía y aún no se ha ejecutado auto-seed
            if (groupsFound.length === 0 && autoSeedSiVacio && !autoSeedEjecutado.current) {
                autoSeedEjecutado.current = true;
                const seedRes = await fetch(`${API}/social/share/groups/seed-account-groups?${queryParams.toString()}`, {
                    method: 'POST',
                    headers: authHeaders(),
                });
                if (seedRes.ok) {
                    const seedData = await seedRes.json();
                    if (Array.isArray(seedData.groups) && seedData.groups.length > 0) {
                        setGrupos(seedData.groups);
                        await cargarListas();
                        return;
                    }
                }
            }

            setGrupos(groupsFound);
            if (data.defaultList) setDefaultList(data.defaultList);
            if (Array.isArray(data.customLists)) setCustomLists(data.customLists);
            if (data.batchLimit) setBatchSize(data.batchLimit);
        } catch (e: any) {
            console.warn('[groupMgmt] error al cargar:', e.message);
        } finally {
            setCargando(false);
        }
    }, [clubId, cargarListas]);

    useEffect(() => {
        cargarGrupos();
        cargarListas();
        cargarBatchConfig();
    }, [cargarGrupos, cargarListas, cargarBatchConfig]);

    // Carga manual / Seed de los 36 grupos de la cuenta
    const ejecutarCarga36Grupos = async () => {
        setCargandoSeed(true);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);

            const res = await fetch(`${API}/social/share/groups/seed-account-groups?${queryParams.toString()}`, {
                method: 'POST',
                headers: authHeaders(),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al cargar grupos');

            toast.success('¡36 grupos reales de la cuenta cargados exitosamente! 👥');
            await cargarGrupos(false);
            await cargarListas();
            if (onUpdated) onUpdated();
        } catch (err: any) {
            toast.error(err.message || 'No se pudieron cargar los grupos');
        } finally {
            setCargandoSeed(false);
        }
    };

    // Validación de URL de Facebook en vivo
    const validarUrlGrupo = async (url: string) => {
        setUrlManual(url);
        setUrlValidadaInfo(null);
        if (!url.trim() || !url.includes('facebook.com')) return;

        setValidandoUrl(true);
        try {
            const res = await fetch(`${API}/social/share/groups/validate-url`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ url }),
            });
            const data = await res.json();
            if (data.ok) {
                setUrlValidadaInfo(data);
            }
        } catch {}
        finally {
            setValidandoUrl(false);
        }
    };

    // Registrar nuevo grupo individual validado
    const registrarGrupoIndividual = async () => {
        if (!urlManual.trim()) {
            toast.error('Ingresa la URL del grupo de Facebook');
            return;
        }

        setRegistrandoNuevo(true);
        try {
            const tags = [...listasSeleccionadasNuevo];
            const line = `${urlManual} | tags:${tags.join(',')}`;

            const res = await fetch(`${API}/distribution/groups/import`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ text: line }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo registrar el grupo');

            toast.success('Grupo de Facebook registrado correctamente');
            setUrlManual('');
            setUrlValidadaInfo(null);
            await cargarGrupos(false);
            await cargarListas();
            if (onUpdated) onUpdated();
        } catch (err: any) {
            toast.error(err.message || 'Error al registrar grupo');
        } finally {
            setRegistrandoNuevo(false);
        }
    };

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
                await cargarGrupos(false);
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

    // Cambiar estado de autorización (verificado vs sin_permiso)
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

    // Asignar o desasignar de una lista específica
    const toggleGrupoEnLista = async (g: GroupItem, listName: string) => {
        const tieneLista = g.tags.some(t => t.toLowerCase() === listName.toLowerCase());
        const nuevasTags = tieneLista
            ? g.tags.filter(t => t.toLowerCase() !== listName.toLowerCase())
            : [...g.tags, listName];

        try {
            await fetch(`${API}/distribution/groups/${g.id}`, {
                method: 'PATCH',
                headers: authHeaders(),
                body: JSON.stringify({ tags: nuevasTags }),
            });

            setGrupos(prev => prev.map(item => item.id === g.id ? { ...item, tags: nuevasTags } : item));
            await cargarListas();
            toast.success(tieneLista ? `Grupo quitado de «${listName}»` : `Grupo asignado a «${listName}» ✨`);
            if (onUpdated) onUpdated();
        } catch {
            toast.error('No se pudo actualizar la lista del grupo.');
        }
    };

    // Acciones en lote para grupos seleccionados
    const asignarSeleccionadosALista = async (listName: string) => {
        if (!seleccionados.size) {
            toast.error('Selecciona al menos un grupo');
            return;
        }
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);

            const res = await fetch(`${API}/social/share/groups/assign-list?${queryParams.toString()}`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    listName,
                    groupIds: Array.from(seleccionados),
                    action: 'add',
                }),
            });
            if (!res.ok) throw new Error('Error al asignar grupos');
            toast.success(`${seleccionados.size} grupos asignados a «${listName}»`);
            setSeleccionados(new Set());
            await cargarGrupos(false);
            await cargarListas();
            if (onUpdated) onUpdated();
        } catch (err: any) {
            toast.error(err.message || 'No se pudieron asignar los grupos');
        }
    };

    const autorizarSeleccionadosEnLote = async (autorizar: boolean) => {
        if (!seleccionados.size) return;
        const targetStatus = autorizar ? 'verificado' : 'sin_permiso';
        try {
            for (const id of Array.from(seleccionados)) {
                await fetch(`${API}/distribution/groups/${id}/status`, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({ status: targetStatus }),
                }).catch(() => {});
            }
            toast.success(`${seleccionados.size} grupos ${autorizar ? 'autorizados' : 'desactivados'}`);
            setSeleccionados(new Set());
            await cargarGrupos(false);
            if (onUpdated) onUpdated();
        } catch {
            toast.error('Error al actualizar grupos en lote');
        }
    };

    // Eliminar grupo individual
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
            await cargarListas();
            if (onUpdated) onUpdated();
        } catch (err: any) {
            toast.error(err.message || 'Error al eliminar grupo.');
        }
    };

    // CRUD de Listas Personalizadas
    const abrirCrearLista = () => {
        setListaEditando(null);
        setNombreListaForm('');
        setDescListaForm('');
        setColorListaForm('blue');
        setMostrarModalLista(true);
    };

    const abrirEditarLista = (lista: CustomDistributionList) => {
        setListaEditando(lista);
        setNombreListaForm(lista.name);
        setDescListaForm(lista.description || '');
        setColorListaForm(lista.color || 'blue');
        setMostrarModalLista(true);
    };

    const guardarListaCustom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nombreListaForm.trim()) {
            toast.error('El nombre de la lista es obligatorio');
            return;
        }

        setGuardandoLista(true);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);

            if (listaEditando) {
                const res = await fetch(`${API}/social/share/groups/custom-lists/${listaEditando.id}?${queryParams.toString()}`, {
                    method: 'PUT',
                    headers: authHeaders(),
                    body: JSON.stringify({
                        name: nombreListaForm.trim(),
                        description: descListaForm.trim(),
                        color: colorListaForm,
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al actualizar lista');
                toast.success('Lista de distribución actualizada');
            } else {
                const res = await fetch(`${API}/social/share/groups/custom-lists?${queryParams.toString()}`, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({
                        name: nombreListaForm.trim(),
                        description: descListaForm.trim(),
                        color: colorListaForm,
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Error al crear lista');
                toast.success(`Lista «${nombreListaForm.trim()}» creada exitosamente`);
            }

            setMostrarModalLista(false);
            await cargarListas();
            await cargarGrupos(false);
            if (onUpdated) onUpdated();
        } catch (err: any) {
            toast.error(err.message || 'Error al guardar lista');
        } finally {
            setGuardandoLista(false);
        }
    };

    const eliminarListaCustom = async (lista: CustomDistributionList) => {
        if (!window.confirm(`¿Eliminar la lista «${lista.name}»?\nLos grupos no serán eliminados, pero ya no tendrán esta etiqueta.`)) return;
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);

            const res = await fetch(`${API}/social/share/groups/custom-lists/${lista.id}?${queryParams.toString()}`, {
                method: 'DELETE',
                headers: authHeaders(),
            });
            if (!res.ok) throw new Error('No se pudo eliminar la lista');
            toast.success('Lista eliminada');
            await cargarListas();
            await cargarGrupos(false);
            if (onUpdated) onUpdated();
        } catch (err: any) {
            toast.error(err.message || 'Error al eliminar lista');
        }
    };

    const fijarListaPredeterminada = async (listName: string) => {
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);

            const res = await fetch(`${API}/social/share/groups/default-list?${queryParams.toString()}`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ listName }),
            });
            if (!res.ok) throw new Error('Error al fijar lista predeterminada');
            setDefaultList(listName);
            toast.success(`«${listName}» fijada como lista predeterminada ✨`);
            await cargarListas();
            if (onUpdated) onUpdated();
        } catch (err: any) {
            toast.error(err.message || 'No se pudo fijar como predeterminada');
        }
    };

    // Guardar configuración de lotes
    const guardarConfigLotes = async () => {
        setGuardandoBatch(true);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);

            const res = await fetch(`${API}/social/share/groups/batch-config?${queryParams.toString()}`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ batchSize }),
            });
            if (!res.ok) throw new Error('Error al guardar configuración de lotes');
            toast.success(`Límite seguro de lote actualizado a ${batchSize} grupos por tanda 🛡️`);
        } catch (err: any) {
            toast.error(err.message || 'Error al guardar configuración');
        } finally {
            setGuardandoBatch(false);
        }
    };

    // Filtrado de grupos
    const gruposFiltrados = useMemo(() => {
        return grupos.filter(g => {
            if (filtroLista !== 'Todos' && filtroLista !== 'Autorizados') {
                if (!g.tags.some(t => t.toLowerCase() === filtroLista.toLowerCase())) return false;
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

    // Seleccionar o deseleccionar todos los visibles
    const toggleSeleccionarTodos = () => {
        if (seleccionados.size === gruposFiltrados.length && gruposFiltrados.length > 0) {
            setSeleccionados(new Set());
        } else {
            setSeleccionados(new Set(gruposFiltrados.map(g => g.id)));
        }
    };

    const toggleSeleccionIndividual = (id: string) => {
        setSeleccionados(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <div className={`flex flex-col overflow-hidden text-gray-800 ${isModal ? 'h-full max-h-[92vh]' : 'bg-white rounded-3xl border border-gray-100 shadow-sm'}`}>
            {/* Cabecera Principal */}
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
                                {fanpageAccountName || 'Distrito 4281 de RI'}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                            Grupos reales disponibles, listas de distribución personalizadas y lotes seguros anti-spam
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

            {/* Selector de Pestañas */}
            <div className="px-6 pt-3 pb-1 border-b border-gray-100 bg-white flex items-center gap-3 shrink-0">
                <button
                    type="button"
                    onClick={() => setTabActiva('grupos')}
                    className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
                        tabActiva === 'grupos'
                            ? 'border-rotary-blue text-rotary-blue'
                            : 'border-transparent text-gray-500 hover:text-gray-900'
                    }`}
                >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Grupos de Facebook</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-gray-100 font-mono">
                        {grupos.length}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setTabActiva('listas')}
                    className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
                        tabActiva === 'listas'
                            ? 'border-rotary-blue text-rotary-blue'
                            : 'border-transparent text-gray-500 hover:text-gray-900'
                    }`}
                >
                    <Tag className="w-3.5 h-3.5" />
                    <span>Listas de Distribución</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-50 text-blue-700 font-mono">
                        {customLists.length}
                    </span>
                </button>

                <button
                    type="button"
                    onClick={() => setTabActiva('seguridad')}
                    className={`pb-2.5 px-3 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 cursor-pointer ${
                        tabActiva === 'seguridad'
                            ? 'border-rotary-blue text-rotary-blue'
                            : 'border-transparent text-gray-500 hover:text-gray-900'
                    }`}
                >
                    <Settings2 className="w-3.5 h-3.5" />
                    <span>Lotes y Seguridad Meta</span>
                </button>
            </div>

            {/* Contenido según pestaña */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
                {tabActiva === 'grupos' && (
                    <>
                        {/* Banner de Sincronización Meta y Carga Rápida de 36 Grupos */}
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
                                        Meta retiró la Groups API en abril 2024. Los grupos reales en los que participa tu cuenta se administran aquí de forma asistida.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={ejecutarCarga36Grupos}
                                        disabled={cargandoSeed}
                                        className="px-3.5 py-2 rounded-xl font-bold bg-rotary-blue text-white hover:bg-rotary-navy shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                                    >
                                        {cargandoSeed ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Cargando...
                                            </>
                                        ) : (
                                            <>
                                                <Download className="w-4 h-4" />
                                                Cargar los 36 grupos reales de la cuenta
                                            </>
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={sincronizarConMeta}
                                        disabled={sincronizandoMeta}
                                        className="px-3.5 py-2 rounded-xl font-bold bg-white text-blue-700 border border-blue-200 hover:bg-blue-50 shadow-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all disabled:opacity-50"
                                    >
                                        {sincronizandoMeta ? (
                                            <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                                        ) : (
                                            <RefreshCw className="w-4 h-4" />
                                        )}
                                        Sincronizar con Meta
                                    </button>
                                </div>
                            </div>

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
                                                    <p><strong>Página conectada:</strong> {metaDiagnostic.diagnostic.fanpage || 'Distrito 4281 de RI'}</p>
                                                    <p><strong>Nota técnica:</strong> {metaDiagnostic.diagnostic.metaNotice}</p>
                                                    <p><strong>Solución:</strong> {metaDiagnostic.diagnostic.recommendation || metaDiagnostic.diagnostic.solution}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Registro con Validador de URL en Vivo */}
                        <div className="p-4 rounded-2xl bg-gray-50/80 border border-gray-200/80 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-gray-900 flex items-center gap-1.5">
                                    <Plus className="w-4 h-4 text-rotary-blue" />
                                    Registrar o validar enlace de grupo de Facebook
                                </span>
                                <span className="text-[11px] text-gray-400">
                                    Identifica el grupo y lo vincula a tus listas
                                </span>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2">
                                <div className="relative flex-1">
                                    <input
                                        type="url"
                                        value={urlManual}
                                        onChange={(e) => validarUrlGrupo(e.target.value)}
                                        placeholder="Pega la URL del grupo: https://www.facebook.com/groups/rotarycolombia"
                                        className="w-full p-2.5 rounded-xl border border-gray-200 bg-white text-xs font-mono text-gray-900 focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-none"
                                    />
                                    {validandoUrl && (
                                        <Loader2 className="w-4 h-4 animate-spin text-rotary-blue absolute right-3 top-1/2 -translate-y-1/2" />
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={registrarGrupoIndividual}
                                    disabled={registrandoNuevo || !urlManual.trim()}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rotary-blue hover:bg-rotary-navy disabled:opacity-40 shadow-xs flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                                >
                                    {registrandoNuevo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                    Registrar grupo
                                </button>
                            </div>

                            {urlValidadaInfo && (
                                <div className="p-3 bg-emerald-50/80 border border-emerald-200/80 rounded-xl text-xs text-emerald-900 space-y-1">
                                    <div className="flex items-center gap-2 font-bold">
                                        <Check className="w-4 h-4 text-emerald-600" />
                                        URL válida de Facebook identificada
                                    </div>
                                    <p className="text-[11px] text-emerald-800">
                                        Identificador: <code className="font-bold">{urlValidadaInfo.groupId}</code> · Nombre inferido: <strong>{urlValidadaInfo.inferredName}</strong> · Idioma sugerido: {urlValidadaInfo.language === 'es' ? 'Español' : 'English'}
                                    </p>
                                </div>
                            )}

                            {/* Asignar a listas durante registro */}
                            <div className="flex items-center gap-3 flex-wrap pt-1 text-xs">
                                <span className="text-gray-500 font-medium">Asignar directamente a:</span>
                                {customLists.map(l => {
                                    const activa = listasSeleccionadasNuevo.includes(l.name);
                                    return (
                                        <button
                                            type="button"
                                            key={l.id}
                                            onClick={() => {
                                                setListasSeleccionadasNuevo(prev =>
                                                    prev.includes(l.name)
                                                        ? prev.filter(x => x !== l.name)
                                                        : [...prev, l.name]
                                                );
                                            }}
                                            className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                                                activa
                                                    ? 'bg-blue-600 text-white border-blue-600'
                                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
                                            }`}
                                        >
                                            {activa && <Check className="w-3 h-3" />}
                                            {l.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Barra de Filtros por Lista y Buscador */}
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

                                    {customLists.map(l => {
                                        const count = grupos.filter(g => g.tags.some(t => t.toLowerCase() === l.name.toLowerCase())).length;
                                        const activa = filtroLista === l.name;
                                        return (
                                            <button
                                                type="button"
                                                key={l.id}
                                                onClick={() => setFiltroLista(l.name)}
                                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                                    activa
                                                        ? 'bg-blue-600 text-white shadow-xs'
                                                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                                }`}
                                            >
                                                <span>{l.name}</span>
                                                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/30 font-mono">
                                                    {count}
                                                </span>
                                            </button>
                                        );
                                    })}

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
                                        <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/30 font-mono">
                                            {grupos.filter(g => g.status === 'verificado').length}
                                        </span>
                                    </button>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => fijarListaPredeterminada('Rotary en Español')}
                                        className="px-3 py-1.5 text-xs font-bold text-gray-700 hover:text-blue-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                                    >
                                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                        Fijar «{defaultList}» como predeterminada
                                    </button>
                                </div>
                            </div>

                            {/* Buscador + Acciones en lote */}
                            <div className="flex flex-col sm:flex-row items-center gap-3">
                                <div className="relative flex-1 w-full">
                                    <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        value={busqueda}
                                        onChange={(e) => setBusqueda(e.target.value)}
                                        placeholder="Buscar grupo por nombre o etiqueta..."
                                        className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-white text-xs text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-none"
                                    />
                                </div>

                                <button
                                    type="button"
                                    onClick={toggleSeleccionarTodos}
                                    className="px-3 py-2 text-xs font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 shrink-0 cursor-pointer"
                                >
                                    {seleccionados.size === gruposFiltrados.length && gruposFiltrados.length > 0 ? 'Desmarcar todos' : 'Seleccionar visibles'}
                                </button>
                            </div>

                            {/* Barra de Acciones en Lote cuando hay selección */}
                            {seleccionados.size > 0 && (
                                <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-150">
                                    <span className="font-bold text-blue-900 text-xs flex items-center gap-2">
                                        <Check className="w-4 h-4 text-blue-600" />
                                        {seleccionados.size} grupos seleccionados
                                    </span>

                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-gray-600 text-xs">Asignar a:</span>
                                        {customLists.map(l => (
                                            <button
                                                type="button"
                                                key={l.id}
                                                onClick={() => asignarSeleccionadosALista(l.name)}
                                                className="px-2.5 py-1 bg-white text-blue-700 border border-blue-200 hover:bg-blue-100 rounded-lg text-xs font-bold cursor-pointer transition-colors"
                                            >
                                                + {l.name}
                                            </button>
                                        ))}

                                        <button
                                            type="button"
                                            onClick={() => autorizarSeleccionadosEnLote(true)}
                                            className="px-2.5 py-1 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-xs font-bold cursor-pointer"
                                        >
                                            Autorizar
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => autorizarSeleccionadosEnLote(false)}
                                            className="px-2.5 py-1 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-lg text-xs font-bold cursor-pointer"
                                        >
                                            Desactivar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Listado de grupos */}
                            {cargando ? (
                                <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                                    <Loader2 className="w-6 h-6 animate-spin text-rotary-blue" />
                                    <p className="text-xs">Cargando grupos registrados...</p>
                                </div>
                            ) : gruposFiltrados.length === 0 ? (
                                <div className="py-12 text-center border border-dashed border-gray-200 rounded-2xl p-6 space-y-3">
                                    <p className="text-gray-600 font-bold text-sm">
                                        No hay grupos registrados en este filtro.
                                    </p>
                                    <p className="text-gray-400 text-xs max-w-md mx-auto">
                                        Carga los 36 grupos de tu cuenta de Facebook con un solo clic para comenzar a administrarlos y clasificarlos.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={ejecutarCarga36Grupos}
                                        disabled={cargandoSeed}
                                        className="px-4 py-2 bg-rotary-blue text-white font-bold rounded-xl hover:bg-rotary-navy transition-all shadow-xs cursor-pointer inline-flex items-center gap-2"
                                    >
                                        <Download className="w-4 h-4" />
                                        Cargar los 36 grupos reales de la cuenta ahora
                                    </button>
                                </div>
                            ) : (
                                <div className="border border-gray-200 rounded-2xl overflow-hidden divide-y divide-gray-100 bg-white shadow-xs">
                                    {gruposFiltrados.map((g) => {
                                        const seleccionado = seleccionados.has(g.id);
                                        const autorizado = g.status === 'verificado';

                                        return (
                                            <div
                                                key={g.id}
                                                className={`p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                                                    seleccionado ? 'bg-blue-50/40' : 'hover:bg-gray-50/50'
                                                }`}
                                            >
                                                <div className="min-w-0 flex items-start gap-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={seleccionado}
                                                        onChange={() => toggleSeleccionIndividual(g.id)}
                                                        className="w-4 h-4 rounded text-rotary-blue focus:ring-rotary-blue border-gray-300 cursor-pointer mt-1"
                                                    />

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

                                                            {/* Etiquetas de listas de distribución */}
                                                            {customLists.map(l => {
                                                                const pertenece = g.tags.some(t => t.toLowerCase() === l.name.toLowerCase());
                                                                return (
                                                                    <button
                                                                        type="button"
                                                                        key={l.id}
                                                                        onClick={() => toggleGrupoEnLista(g, l.name)}
                                                                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                                                                            pertenece
                                                                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                                                                : 'bg-white text-gray-400 border-dashed border-gray-200 hover:border-blue-300'
                                                                        }`}
                                                                        title={pertenece ? `Quitar de ${l.name}` : `Asignar a ${l.name}`}
                                                                    >
                                                                        {pertenece && <Check className="w-2.5 h-2.5 text-blue-600" />}
                                                                        {l.name}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Controles de acción por grupo */}
                                                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleAutorizado(g)}
                                                        className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                                                            autorizado
                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                : 'bg-amber-50 text-amber-700 border-amber-200'
                                                        }`}
                                                    >
                                                        {autorizado ? (
                                                            <>
                                                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                                                Autorizado
                                                            </>
                                                        ) : (
                                                            <>
                                                                <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                                                                Pausado
                                                            </>
                                                        )}
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => eliminarGrupo(g)}
                                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                                        title="Eliminar de la plataforma"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Pestaña: Listas de Distribución Personalizadas */}
                {tabActiva === 'listas' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h4 className="font-bold text-gray-900 text-sm">Listas de Distribución</h4>
                                <p className="text-gray-500 text-xs">
                                    Crea y administra listas personalizadas (ej. Rotary en Español, Rotary Colombia, Rotary Latinoamérica)
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={abrirCrearLista}
                                className="px-3.5 py-2 rounded-xl text-xs font-bold text-white bg-rotary-blue hover:bg-rotary-navy shadow-xs flex items-center gap-1.5 cursor-pointer"
                            >
                                <Plus className="w-4 h-4" />
                                Nueva lista
                            </button>
                        </div>

                        {cargandoListas ? (
                            <div className="py-12 text-center text-gray-400">
                                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-rotary-blue" />
                                Cargando listas...
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {customLists.map(lista => {
                                    const esDefault = lista.name.toLowerCase() === defaultList.toLowerCase();
                                    return (
                                        <div
                                            key={lista.id}
                                            className="p-4 bg-white border border-gray-200 rounded-2xl space-y-3 shadow-2xs hover:border-blue-200 transition-colors"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="space-y-0.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-gray-900 text-sm">
                                                            {lista.name}
                                                        </span>
                                                        {esDefault && (
                                                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                                                                <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                                                                Predeterminada
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-gray-500 text-xs">
                                                        {lista.description || 'Sin descripción'}
                                                    </p>
                                                </div>

                                                <span className="px-2.5 py-1 rounded-xl text-xs font-bold bg-blue-50 text-blue-700 shrink-0">
                                                    {lista.groupCount || 0} grupos
                                                </span>
                                            </div>

                                            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                                                {!esDefault ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => fijarListaPredeterminada(lista.name)}
                                                        className="text-xs font-bold text-gray-500 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
                                                    >
                                                        <Bookmark className="w-3.5 h-3.5" />
                                                        Hacer predeterminada
                                                    </button>
                                                ) : (
                                                    <span className="text-[11px] text-amber-600 font-bold flex items-center gap-1">
                                                        <Check className="w-3.5 h-3.5" /> Lista activa por omisión
                                                    </span>
                                                )}

                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => abrirEditarLista(lista)}
                                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                                                        title="Editar lista"
                                                    >
                                                        <Edit3 className="w-3.5 h-3.5" />
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => eliminarListaCustom(lista)}
                                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                                                        title="Eliminar lista"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* Pestaña: Lotes y Seguridad Meta */}
                {tabActiva === 'seguridad' && (
                    <div className="space-y-4 max-w-xl">
                        <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-2xl space-y-2">
                            <div className="flex items-center gap-2 text-blue-950 font-bold text-sm">
                                <ShieldCheck className="w-4 h-4 text-blue-600" />
                                Protección contra filtros anti-spam de Meta (Behavioral Rate Limiting)
                            </div>
                            <p className="text-gray-600 text-xs leading-relaxed">
                                Facebook detecta y sanciona temporalmente las cuentas que distribuyen publicaciones a decenas de grupos en un solo segundo (Error 368). Para proteger la integridad de tu página del Distrito 4281, Club Platform divide la distribución en lotes controlados.
                            </p>
                        </div>

                        <div className="p-4 bg-white border border-gray-200 rounded-2xl space-y-4">
                            <div>
                                <label className="font-bold text-gray-900 block text-xs mb-1">
                                    Tamaño de lote seguro por tanda:
                                </label>
                                <p className="text-gray-500 text-xs mb-3">
                                    Cantidad recomendada de grupos a procesar antes de permitir una pausa breve (entre 3 y 20 grupos).
                                </p>

                                <div className="flex items-center gap-3">
                                    {[5, 8, 10, 15].map(tam => (
                                        <button
                                            type="button"
                                            key={tam}
                                            onClick={() => setBatchSize(tam)}
                                            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                                batchSize === tam
                                                    ? 'bg-rotary-blue text-white border-rotary-blue shadow-xs'
                                                    : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                            }`}
                                        >
                                            {tam} grupos
                                        </button>
                                    ))}

                                    <div className="flex items-center gap-1.5 ml-2">
                                        <input
                                            type="number"
                                            min={3}
                                            max={25}
                                            value={batchSize}
                                            onChange={(e) => setBatchSize(parseInt(e.target.value, 10) || 5)}
                                            className="w-16 p-1.5 rounded-lg border border-gray-200 text-center font-bold text-xs"
                                        />
                                        <span className="text-gray-500 text-xs">grupos</span>
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={guardarConfigLotes}
                                disabled={guardandoBatch}
                                className="px-4 py-2 bg-rotary-blue text-white font-bold rounded-xl text-xs hover:bg-rotary-navy transition-all shadow-xs cursor-pointer flex items-center gap-2"
                            >
                                {guardandoBatch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                Guardar configuración de lotes
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal de Crear / Editar Lista */}
            {mostrarModalLista && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full space-y-4 shadow-xl border border-gray-100 animate-in fade-in zoom-in duration-150">
                        <div className="flex items-center justify-between">
                            <h4 className="font-bold text-gray-900 text-base">
                                {listaEditando ? 'Editar Lista de Distribución' : 'Nueva Lista de Distribución'}
                            </h4>
                            <button
                                type="button"
                                onClick={() => setMostrarModalLista(false)}
                                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={guardarListaCustom} className="space-y-3 text-xs">
                            <div>
                                <label className="font-bold text-gray-700 block mb-1">
                                    Nombre de la lista:
                                </label>
                                <input
                                    type="text"
                                    value={nombreListaForm}
                                    onChange={(e) => setNombreListaForm(e.target.value)}
                                    placeholder="Ej. Rotary Colombia, Rotary Latinoamérica..."
                                    required
                                    className="w-full p-2.5 rounded-xl border border-gray-200 bg-white font-medium text-gray-900 focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                />
                            </div>

                            <div>
                                <label className="font-bold text-gray-700 block mb-1">
                                    Descripción (opcional):
                                </label>
                                <textarea
                                    value={descListaForm}
                                    onChange={(e) => setDescListaForm(e.target.value)}
                                    rows={2}
                                    placeholder="Breve propósito de esta lista de grupos..."
                                    className="w-full p-2.5 rounded-xl border border-gray-200 bg-white text-gray-900 focus:ring-2 focus:ring-rotary-blue/20 outline-none"
                                />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setMostrarModalLista(false)}
                                    className="px-3 py-2 rounded-xl text-gray-600 hover:bg-gray-100 font-bold cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={guardandoLista || !nombreListaForm.trim()}
                                    className="px-4 py-2 bg-rotary-blue text-white rounded-xl font-bold hover:bg-rotary-navy shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                >
                                    {guardandoLista ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                    Guardar lista
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Pie del Panel */}
            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50 shrink-0 text-xs">
                <span className="text-gray-500 font-medium">
                    Total: <strong>{grupos.length} grupos</strong> ({grupos.filter(g => g.status === 'verificado').length} autorizados)
                </span>

                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 rounded-xl font-bold bg-gray-900 text-white hover:bg-black shadow-xs cursor-pointer"
                    >
                        Listo
                    </button>
                )}
            </div>
        </div>
    );
};

export const GroupManagementModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    clubId?: string | null;
    fanpageAccountName?: string | null;
    onUpdated?: () => void;
}> = ({ isOpen, onClose, clubId, fanpageAccountName, onUpdated }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[92vh]">
                <GroupManagementPanel
                    clubId={clubId}
                    fanpageAccountName={fanpageAccountName}
                    onUpdated={onUpdated}
                    onClose={onClose}
                    isModal
                />
            </div>
        </div>
    );
};

export default GroupManagementModal;
