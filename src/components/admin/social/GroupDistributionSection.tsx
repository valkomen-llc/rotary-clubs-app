/**
 * Distribución de la publicación oficial de Fanpage en grupos autorizados de Facebook.
 *
 * v4.1073.0: Mantiene la Fanpage como publicación principal y fuente oficial.
 * Al confirmar Meta que el post fue creado en la página, este componente permite
 * distribuir esa misma publicación (su permalink oficial) hacia los grupos de Facebook
 * autorizados, evitando publicaciones duplicadas y respetando las restricciones de la API de Meta.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Users, CheckCircle2, AlertCircle, Clock, ExternalLink, Copy, Check,
    Search, ArrowLeft, Send, ShieldCheck, Sparkles, Filter, RefreshCw, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { ShareGroupTarget, GroupDistributionOutcome } from '../../../lib/socialShare';

const API = import.meta.env.VITE_API_URL || '/api';
const authHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('rotary_token')}`,
    'Content-Type': 'application/json',
});

interface Props {
    entityType: string;
    entityId: string;
    postTitle: string;
    fanpagePostId?: string | null;
    fanpagePostUrl: string;
    fanpageAccountName?: string | null;
    clubId?: string | null;
    onBack?: () => void;
    onDone?: () => void;
}

export const GroupDistributionSection: React.FC<Props> = ({
    entityType,
    entityId,
    postTitle,
    fanpagePostId,
    fanpagePostUrl,
    fanpageAccountName,
    clubId,
    onBack,
    onDone,
}) => {
    const [grupos, setGrupos] = useState<ShareGroupTarget[]>([]);
    const [cargando, setCargando] = useState(true);
    const [errorCarga, setErrorCarga] = useState<string | null>(null);

    // Filtros
    const [filtroCategoria, setFiltroCategoria] = useState<string>('Todos');
    const [busqueda, setBusqueda] = useState<string>('');

    // Selección
    const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

    // Estado de ejecución de la distribución
    const [distribuyendo, setDistribuyendo] = useState(false);
    const [outcomes, setOutcomes] = useState<GroupDistributionOutcome[] | null>(null);
    const [copiado, setCopiado] = useState(false);

    // Cargar grupos autorizados desde el backend
    const cargarGrupos = useCallback(async () => {
        setCargando(true);
        setErrorCarga(null);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);
            const res = await fetch(`${API}/social/share/group-targets?${queryParams.toString()}`, {
                headers: authHeaders(),
            });
            if (!res.ok) throw new Error('No se pudieron consultar los grupos autorizados.');
            const data = await res.json();
            const lista: ShareGroupTarget[] = data.groups || [];
            setGrupos(lista);

            // Preseleccionar por defecto todos los grupos verificados disponibles
            const verificadosIds = lista.filter(g => g.canPublish).map(g => g.groupId);
            setSeleccion(new Set(verificadosIds));
        } catch (err: any) {
            setErrorCarga(err.message || 'Error al cargar grupos.');
        } finally {
            setCargando(false);
        }
    }, [clubId]);

    useEffect(() => {
        cargarGrupos();
    }, [cargarGrupos]);

    // Copiar enlace oficial
    const copiarEnlace = () => {
        if (!fanpagePostUrl) return;
        navigator.clipboard.writeText(fanpagePostUrl);
        setCopiado(true);
        toast.success('Enlace de la Fanpage copiado');
        setTimeout(() => setCopiado(false), 2000);
    };

    // Grupos filtrados por búsqueda y categoría
    const gruposFiltrados = useMemo(() => {
        return grupos.filter(g => {
            // Filtro por categoría rápida
            if (filtroCategoria === 'Rotary en Español') {
                const esEspanol = g.language === 'es' || g.tags.some(t => /español|espanol/i.test(t));
                if (!esEspanol) return false;
            } else if (filtroCategoria === 'Colombia') {
                const esColombia = g.region === 'Colombia' || g.tags.some(t => /colombia/i.test(t)) || g.name.toLowerCase().includes('colombia');
                if (!esColombia) return false;
            } else if (filtroCategoria === 'Latinoamérica') {
                const esLatam = g.region === 'Latinoamérica' || g.tags.some(t => /latinoam|latam|sur/i.test(t)) || g.name.toLowerCase().includes('latinoam');
                if (!esLatam) return false;
            } else if (filtroCategoria === 'México') {
                const esMexico = g.region === 'México' || g.tags.some(t => /m[eé]xico/i.test(t)) || g.name.toLowerCase().includes('méxico') || g.name.toLowerCase().includes('mexico');
                if (!esMexico) return false;
            }

            // Filtro por texto
            if (busqueda.trim()) {
                const q = busqueda.toLowerCase().trim();
                const matchName = g.name.toLowerCase().includes(q);
                const matchTags = g.tags.some(t => t.toLowerCase().includes(q));
                const matchRegion = (g.region || '').toLowerCase().includes(q);
                if (!matchName && !matchTags && !matchRegion) return false;
            }

            return true;
        });
    }, [grupos, filtroCategoria, busqueda]);

    // Alternar selección de un grupo
    const toggleGrupo = (groupId: string) => {
        setSeleccion(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    // Seleccionar todos los visibles
    const seleccionarVisibles = () => {
        const ids = gruposFiltrados.filter(g => g.canPublish).map(g => g.groupId);
        setSeleccion(new Set([...seleccion, ...ids]));
    };

    // Deseleccionar todos
    const deseleccionarTodos = () => {
        setSeleccion(new Set());
    };

    // Iniciar distribución a los grupos seleccionados
    const iniciarDistribucion = async () => {
        if (!seleccion.size) {
            toast.error('Seleccioná al menos un grupo autorizado.');
            return;
        }

        const elegidos = grupos.filter(g => seleccion.has(g.groupId));
        setDistribuyendo(true);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);

            const res = await fetch(`${API}/social/share/distribute-to-groups?${queryParams.toString()}`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    entityType,
                    entityId,
                    fanpagePostId,
                    fanpagePostUrl,
                    groups: elegidos.map(g => ({
                        groupId: g.groupId,
                        name: g.name,
                        url: g.url,
                    })),
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo iniciar la distribución a grupos.');

            setOutcomes(data.outcomes || []);
            toast.success(`Distribución preparada para ${elegidos.length} grupos.`);
        } catch (err: any) {
            toast.error(err.message || 'Error al preparar distribución.');
        } finally {
            setDistribuyendo(false);
        }
    };

    // Compartir un grupo mediante dialog oficial de Meta
    const abrirCompartirGrupo = (o: GroupDistributionOutcome) => {
        const urlToOpen = o.dialogUrl || (o.url ? o.url : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fanpagePostUrl)}`);
        window.open(urlToOpen, '_blank', 'width=640,height=680,scrollbars=yes,resizable=yes');
    };

    // Actualizar estado de un grupo individual
    const marcarEstadoGrupo = async (groupId: string, status: 'published' | 'error', errorMsg?: string) => {
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);

            await fetch(`${API}/social/share/group-status?${queryParams.toString()}`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    entityType,
                    entityId,
                    groupId,
                    status,
                    error: errorMsg || null,
                }),
            });

            setOutcomes(prev => {
                if (!prev) return prev;
                return prev.map(item => item.groupId === groupId ? { ...item, status, error: errorMsg || null } : item);
            });

            if (status === 'published') {
                toast.success('Publicación en grupo confirmada');
            }
        } catch (e: any) {
            toast.error(e.message || 'Error al actualizar estado del grupo');
        }
    };

    // Conteo de resultados
    const conteoOutcomes = useMemo(() => {
        if (!outcomes) return { publicados: 0, pendientes: 0, errores: 0 };
        return {
            publicados: outcomes.filter(o => o.status === 'published').length,
            pendientes: outcomes.filter(o => o.status === 'pending').length,
            errores: outcomes.filter(o => o.status === 'error').length,
        };
    }, [outcomes]);

    return (
        <div className="space-y-6">
            {/* Cabecera con navegación */}
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2.5">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            title="Volver al resumen"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div>
                        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                            <Users className="w-5 h-5 text-rotary-blue" />
                            Compartir en grupos de Facebook
                        </h3>
                        <p className="text-xs text-gray-500">
                            Distribuí la publicación oficial de la Fanpage hacia los grupos autorizados
                        </p>
                    </div>
                </div>

                {fanpageAccountName && (
                    <span className="text-xs font-semibold px-2.5 py-1 bg-sky-50 text-rotary-blue border border-sky-100 rounded-full flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        Fanpage: {fanpageAccountName}
                    </span>
                )}
            </div>

            {/* Ficha de la publicación oficial como fuente única */}
            <div className="bg-gradient-to-r from-sky-50/60 to-indigo-50/40 border border-sky-100/80 rounded-2xl p-4.5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-rotary-blue">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            Publicación Oficial de Origen (Fanpage)
                        </div>
                        <p className="text-sm font-bold text-gray-900 line-clamp-1">
                            {postTitle || 'Artículo publicado'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={copiarEnlace}
                            className="text-xs font-bold px-3 py-1.5 bg-white border border-gray-200 text-gray-700 hover:text-rotary-blue hover:border-sky-300 rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                        >
                            {copiado ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiado ? 'Copiado' : 'Copiar enlace'}
                        </button>
                        {fanpagePostUrl && (
                            <a
                                href={fanpagePostUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-bold px-3 py-1.5 bg-rotary-blue text-white hover:bg-rotary-navy rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Ver post
                            </a>
                        )}
                    </div>
                </div>

                <div className="text-xs text-gray-600 bg-white/75 border border-sky-100/60 rounded-xl p-2.5 flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="leading-relaxed">
                        Al compartir la publicación de la Fanpage en lugar de crear un post duplicado, todas las reacciones,
                        comentarios y métricas se concentran en la página oficial de Rotary.
                    </p>
                </div>
            </div>

            {/* Si aún no se ha lanzado la distribución: selector de grupos y filtros */}
            {!outcomes && (
                <div className="space-y-4">
                    {/* Barra de filtros rápidos por categoría */}
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {['Todos', 'Rotary en Español', 'Colombia', 'Latinoamérica', 'México'].map(cat => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setFiltroCategoria(cat)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                        filtroCategoria === cat
                                            ? 'bg-rotary-blue text-white shadow-xs'
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200/80 hover:text-gray-900'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        <div className="relative w-full sm:w-64">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar grupos..."
                                value={busqueda}
                                onChange={e => setBusqueda(e.target.value)}
                                className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-rotary-blue focus:outline-none transition-all"
                            />
                        </div>
                    </div>

                    {/* Resumen de selección y controles rápidos */}
                    <div className="flex items-center justify-between text-xs text-gray-500 px-1">
                        <div>
                            Grupos disponibles: <span className="font-bold text-gray-800">{gruposFiltrados.length}</span> ·
                            Seleccionados: <span className="font-bold text-rotary-blue">{seleccion.size}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={seleccionarVisibles}
                                className="font-bold text-rotary-blue hover:underline"
                            >
                                Seleccionar todos
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                                type="button"
                                onClick={deseleccionarTodos}
                                className="font-bold text-gray-500 hover:text-gray-800 hover:underline"
                            >
                                Deseleccionar
                            </button>
                        </div>
                    </div>

                    {/* Lista de grupos */}
                    {cargando ? (
                        <div className="py-12 flex flex-col items-center justify-center gap-2 text-gray-400">
                            <Loader2 className="w-6 h-6 animate-spin text-rotary-blue" />
                            <p className="text-xs">Consultando grupos autorizados...</p>
                        </div>
                    ) : errorCarga ? (
                        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between">
                            <span>{errorCarga}</span>
                            <button
                                type="button"
                                onClick={cargarGrupos}
                                className="font-bold hover:underline flex items-center gap-1"
                            >
                                <RefreshCw className="w-3.5 h-3.5" /> Reintentar
                            </button>
                        </div>
                    ) : gruposFiltrados.length === 0 ? (
                        <div className="py-12 text-center text-gray-400 text-xs border border-dashed border-gray-200 rounded-2xl">
                            No se encontraron grupos autorizados con los filtros aplicados.
                        </div>
                    ) : (
                        <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                            {gruposFiltrados.map(g => {
                                const selected = seleccion.has(g.groupId);
                                return (
                                    <div
                                        key={g.groupId}
                                        onClick={() => g.canPublish && toggleGrupo(g.groupId)}
                                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                                            !g.canPublish
                                                ? 'bg-gray-50/70 border-gray-200 opacity-60 cursor-not-allowed'
                                                : selected
                                                    ? 'bg-sky-50/60 border-rotary-blue/50 shadow-xs'
                                                    : 'bg-white border-gray-200 hover:border-gray-300'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <input
                                                type="checkbox"
                                                checked={selected}
                                                disabled={!g.canPublish}
                                                onChange={() => {}}
                                                className="w-4 h-4 rounded text-rotary-blue focus:ring-rotary-blue border-gray-300 cursor-pointer"
                                            />
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-gray-900 truncate">
                                                    {g.name}
                                                </p>
                                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                                        {g.languageLabel || 'Español'}
                                                    </span>
                                                    {g.region && (
                                                        <span className="text-[10px] font-medium text-gray-500">
                                                            {g.region}
                                                        </span>
                                                    )}
                                                    {g.tags.map(tag => (
                                                        <span key={tag} className="text-[10px] text-gray-400">
                                                            #{tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            {g.canPublish ? (
                                                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                    <ShieldCheck className="w-3 h-3" />
                                                    Autorizado
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3" />
                                                    Sin verificar
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Botón de acción principal para iniciar distribución */}
                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={onBack}
                            className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-800"
                        >
                            Cancelar
                        </button>

                        <button
                            type="button"
                            onClick={iniciarDistribucion}
                            disabled={distribuyendo || seleccion.size === 0}
                            className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-rotary-blue hover:bg-rotary-navy disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-all flex items-center gap-2"
                        >
                            {distribuyendo ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Preparando distribución...
                                </>
                            ) : (
                                <>
                                    <Send className="w-4 h-4" />
                                    Distribuir publicación oficial en {seleccion.size} grupos
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Si ya se inició la distribución: vista de resultados y acciones individuales por grupo */}
            {outcomes && (
                <div className="space-y-4">
                    {/* Barra de progreso / resumen */}
                    <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl flex items-center justify-between text-xs">
                        <div className="flex items-center gap-3">
                            <span className="text-emerald-700 font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Publicados: {conteoOutcomes.publicados}
                            </span>
                            <span className="text-amber-700 font-bold flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-amber-500" />
                                Pendientes: {conteoOutcomes.pendientes}
                            </span>
                            {conteoOutcomes.errores > 0 && (
                                <span className="text-rose-700 font-bold flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                                    Errores: {conteoOutcomes.errores}
                                </span>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => setOutcomes(null)}
                            className="text-[11px] font-bold text-rotary-blue hover:underline"
                        >
                            Modificar selección
                        </button>
                    </div>

                    {/* Tarjetas individuales de seguimiento */}
                    <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
                        {outcomes.map(o => (
                            <div
                                key={o.groupId}
                                className="p-3 bg-white border border-gray-200 rounded-xl flex items-center justify-between gap-3 shadow-xs"
                            >
                                <div className="min-w-0 space-y-0.5">
                                    <p className="text-xs font-bold text-gray-900 truncate">
                                        {o.name}
                                    </p>
                                    <div className="flex items-center gap-2">
                                        {o.status === 'published' ? (
                                            <span className="text-[10px] font-bold text-emerald-700 flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                                Publicado en el grupo
                                            </span>
                                        ) : o.status === 'error' ? (
                                            <span className="text-[10px] font-bold text-rose-700 flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3 text-rose-600" />
                                                {o.error || 'Error al publicar'}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1">
                                                <Clock className="w-3 h-3 text-amber-500" />
                                                Listo para compartir
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {o.status !== 'published' && (
                                        <button
                                            type="button"
                                            onClick={() => abrirCompartirGrupo(o)}
                                            className="px-3 py-1.5 text-xs font-bold text-rotary-blue bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-lg transition-colors flex items-center gap-1.5"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            Compartir en Facebook
                                        </button>
                                    )}

                                    {o.status !== 'published' ? (
                                        <button
                                            type="button"
                                            onClick={() => marcarEstadoGrupo(o.groupId, 'published')}
                                            className="px-2.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                                            title="Confirmar que se compartió en el grupo"
                                        >
                                            <Check className="w-3.5 h-3.5" />
                                        </button>
                                    ) : (
                                        <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-100 flex items-center gap-1">
                                            <Check className="w-3 h-3" /> Listo
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Botón de cierre o finalización */}
                    <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
                        <button
                            type="button"
                            onClick={onDone || onBack}
                            className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-rotary-blue hover:bg-rotary-navy shadow-xs transition-all"
                        >
                            Finalizar distribución
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GroupDistributionSection;
