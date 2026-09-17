/**
 * Distribución de la publicación oficial de Fanpage en grupos autorizados de Facebook (v4.1075.0).
 *
 * Mantiene la Fanpage como publicación principal y fuente oficial.
 * Incorpora:
 * 1. Generación y edición manual de mensaje o CTA contextual (máx 100 caracteres, terminado en emoji).
 * 2. Vista previa interactiva en tiempo real 100% fiel a cómo se ve la publicación dentro del grupo de Facebook.
 * 3. Selección y filtros por grupos de Rotary en español (Colombia, Latam, México).
 * 4. Distribución segura asistida y registro individual de estados.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    Users, CheckCircle2, AlertCircle, Clock, ExternalLink, Copy, Check,
    Search, ArrowLeft, Send, ShieldCheck, Sparkles, Filter, RefreshCw,
    Loader2, ThumbsUp, MessageSquare, Share2 as ShareIcon, Globe, Settings,
    Download, Shield
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    type ShareGroupTarget,
    type GroupDistributionOutcome,
    generateDeterministicGroupCTA
} from '../../../lib/socialShare';
import { GroupManagementModal } from './GroupManagementModal';

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
    featuredImage?: string | null;
    articleExcerpt?: string | null;
    articleContent?: string | null;
    canonicalDomain?: string | null;
    authorName?: string | null;
    fanpageAvatar?: string | null;
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
    featuredImage,
    articleExcerpt,
    articleContent,
    canonicalDomain,
    authorName,
    fanpageAvatar,
    clubId,
    onBack,
    onDone,
}) => {
    const [grupos, setGrupos] = useState<ShareGroupTarget[]>([]);
    const [cargando, setCargando] = useState(true);
    const [errorCarga, setErrorCarga] = useState<string | null>(null);

    // Mensaje / CTA para los grupos (máximo 100 caracteres, terminado en emoji)
    const [ctaMensaje, setCtaMensaje] = useState<string>(() => {
        return generateDeterministicGroupCTA(postTitle, articleExcerpt || '', articleContent || '');
    });
    const [regenerandoCTA, setRegenerandoCTA] = useState(false);
    const [ctaCopiado, setCtaCopiado] = useState(false);

    // Filtros de grupos
    const [filtroCategoria, setFiltroCategoria] = useState<string>('Todos');
    const [busqueda, setBusqueda] = useState<string>('');

    // Selección
    const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

    // Estado de ejecución de la distribución
    const [distribuyendo, setDistribuyendo] = useState(false);
    const [outcomes, setOutcomes] = useState<GroupDistributionOutcome[] | null>(null);
    const [copiadoEnlace, setCopiadoEnlace] = useState(false);
    const [categoriasListas, setCategoriasListas] = useState<string[]>(['Todos', 'Rotary en Español', 'Colombia', 'Latinoamérica', 'México']);
    const [mostrarAdminGrupos, setMostrarAdminGrupos] = useState(false);
    const [batchSize, setBatchSize] = useState<number>(5);
    const [customLists, setCustomLists] = useState<any[]>([]);
    const [cargandoSeed, setCargandoSeed] = useState(false);

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

            if (data.batchLimit) setBatchSize(data.batchLimit);
            if (Array.isArray(data.customLists)) setCustomLists(data.customLists);

            if (Array.isArray(data.categories) && data.categories.length) {
                setCategoriasListas(data.categories);
            }

            const def = data.defaultList || 'Rotary en Español';
            // Cargar automáticamente los grupos configurados para la lista Rotary en Español si existen
            const enDefault = lista.filter(g => g.canPublish && (
                g.tags.some(t => t.toLowerCase() === def.toLowerCase()) ||
                (def === 'Rotary en Español' && (g.language === 'es' || g.tags.some(t => /español|espanol/i.test(t))))
            ));

            if (enDefault.length > 0) {
                setFiltroCategoria(def);
                setSeleccion(new Set(enDefault.map(g => g.groupId)));
            } else {
                const verificadosIds = lista.filter(g => g.canPublish).map(g => g.groupId);
                setSeleccion(new Set(verificadosIds));
            }
        } catch (err: any) {
            setErrorCarga(err.message || 'Error al cargar grupos.');
        } finally {
            setCargando(false);
        }
    }, [clubId]);

    useEffect(() => {
        cargarGrupos();
    }, [cargarGrupos]);

    // Regenerar CTA con IA o rotación contextual
    const regenerarCTA = async () => {
        setRegenerandoCTA(true);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);

            const res = await fetch(`${API}/social/share/group-cta?${queryParams.toString()}`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    entityType,
                    entityId,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                if (data.cta) {
                    setCtaMensaje(data.cta);
                    toast.success('Mensaje generado para grupos ✨');
                    return;
                }
            }

            // Respaldo contextual determinista
            const nuevo = generateDeterministicGroupCTA(postTitle, articleExcerpt || '', articleContent || '');
            setCtaMensaje(nuevo);
            toast.success('Mensaje contextual actualizado ✨');
        } catch {
            const nuevo = generateDeterministicGroupCTA(postTitle, articleExcerpt || '', articleContent || '');
            setCtaMensaje(nuevo);
        } finally {
            setRegenerandoCTA(false);
        }
    };

    // Copiar CTA
    const copiarCTA = () => {
        if (!ctaMensaje) return;
        navigator.clipboard.writeText(ctaMensaje);
        setCtaCopiado(true);
        toast.success('Mensaje copiado al portapapeles');
        setTimeout(() => setCtaCopiado(false), 2000);
    };

    // Copiar enlace oficial de Fanpage
    const copiarEnlace = () => {
        if (!fanpagePostUrl) return;
        navigator.clipboard.writeText(fanpagePostUrl);
        setCopiadoEnlace(true);
        toast.success('Enlace de la Fanpage copiado');
        setTimeout(() => setCopiadoEnlace(false), 2000);
    };

    // Grupos filtrados por búsqueda y categoría
    const gruposFiltrados = useMemo(() => {
        return grupos.filter(g => {
            if (filtroCategoria === 'Rotary en Español') {
                const esEspanol = g.tags.includes('Rotary en Español') || g.language === 'es' || g.tags.some(t => /español|espanol/i.test(t));
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
            } else if (filtroCategoria !== 'Todos') {
                const matchTag = g.tags.includes(filtroCategoria) || g.name.toLowerCase().includes(filtroCategoria.toLowerCase());
                if (!matchTag) return false;
            }

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

    // Seleccionar lista y cargar automáticamente sus grupos
    const seleccionarCategoria = (cat: string) => {
        setFiltroCategoria(cat);
        if (cat === 'Todos') {
            const todosVerificados = grupos.filter(g => g.canPublish).map(g => g.groupId);
            setSeleccion(new Set(todosVerificados));
        } else if (cat === 'Rotary en Español') {
            const listaEspanol = grupos.filter(g => g.canPublish && (
                g.tags.some(t => t.toLowerCase() === 'rotary en español') ||
                g.language === 'es' ||
                g.tags.some(t => /español|espanol/i.test(t))
            ));
            setSeleccion(new Set(listaEspanol.map(g => g.groupId)));
            toast(`Lista Rotary en Español seleccionada (${listaEspanol.length} grupos)`, { icon: '🌎' });
        } else {
            const listaCat = grupos.filter(g => g.canPublish && (
                g.tags.some(t => t.toLowerCase() === cat.toLowerCase()) ||
                (g.region && g.region.toLowerCase() === cat.toLowerCase()) ||
                g.name.toLowerCase().includes(cat.toLowerCase())
            ));
            setSeleccion(new Set(listaCat.map(g => g.groupId)));
            toast(`Lista «${cat}» seleccionada (${listaCat.length} grupos)`);
        }
    };

    // Lotes seguros anti-spam de Meta
    const lotes = useMemo(() => {
        const elegidos = grupos.filter(g => seleccion.has(g.groupId));
        if (elegidos.length <= batchSize) return [elegidos];
        const chunks: ShareGroupTarget[][] = [];
        for (let i = 0; i < elegidos.length; i += batchSize) {
            chunks.push(elegidos.slice(i, i + batchSize));
        }
        return chunks;
    }, [grupos, seleccion, batchSize]);

    const toggleGrupo = (groupId: string) => {
        setSeleccion(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    const seleccionarVisibles = () => {
        const ids = gruposFiltrados.filter(g => g.canPublish).map(g => g.groupId);
        setSeleccion(new Set([...seleccion, ...ids]));
    };

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
                    message: ctaMensaje,
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

    const abrirCompartirGrupo = (o: GroupDistributionOutcome) => {
        const urlToOpen = o.dialogUrl || (o.url ? o.url : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fanpagePostUrl)}`);
        window.open(urlToOpen, '_blank', 'width=640,height=680,scrollbars=yes,resizable=yes');
    };

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

    const conteoOutcomes = useMemo(() => {
        if (!outcomes) return { publicados: 0, pendientes: 0, errores: 0 };
        return {
            publicados: outcomes.filter(o => o.status === 'published').length,
            pendientes: outcomes.filter(o => o.status === 'pending').length,
            errores: outcomes.filter(o => o.status === 'error').length,
        };
    }, [outcomes]);

    const tieneEmojiFinal = useMemo(() => {
        return /\p{Extended_Pictographic}\s*$/u.test(ctaMensaje.trim());
    }, [ctaMensaje]);

    return (
        <div className="space-y-6">
            {/* Cabecera con navegación */}
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2.5">
                    {onBack && (
                        <button
                            type="button"
                            onClick={onBack}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
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

            {/* Ficha de origen Fanpage */}
            <div className="bg-gradient-to-r from-sky-50/60 to-indigo-50/40 border border-sky-100/80 rounded-2xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-rotary-blue">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                            Publicación Oficial de Origen (Fanpage)
                        </div>
                        <p className="text-xs font-bold text-gray-900 truncate">
                            {postTitle || 'Artículo publicado'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={copiarEnlace}
                            className="text-xs font-bold px-3 py-1.5 bg-white border border-gray-200 text-gray-700 hover:text-rotary-blue hover:border-sky-300 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            {copiadoEnlace ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiadoEnlace ? 'Copiado' : 'Copiar enlace'}
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
            </div>

            {/* Layout principal: Si no se ha lanzado, mostramos 2 columnas (Configuración y Selector a la izquierda, Vista Previa fiel a Meta a la derecha) */}
            {!outcomes ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                    {/* Columna Izquierda (7/12): Editor de CTA + Selector de Grupos */}
                    <div className="lg:col-span-7 space-y-4">
                        {/* Editor de Mensaje / CTA Contextual */}
                        <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-xs space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                                <label className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                    <MessageSquare className="w-3.5 h-3.5 text-rotary-blue" />
                                    Mensaje o CTA para el grupo
                                </label>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={regenerarCTA}
                                        disabled={regenerandoCTA}
                                        className="text-[11px] font-bold text-rotary-blue hover:text-rotary-navy hover:underline flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                                    >
                                        {regenerandoCTA ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-amber-500" />}
                                        Regenerar con IA
                                    </button>
                                    <span className="text-gray-300">·</span>
                                    <button
                                        type="button"
                                        onClick={copiarCTA}
                                        className="text-[11px] font-bold text-gray-500 hover:text-gray-800 flex items-center gap-1 cursor-pointer"
                                        title="Copiar mensaje"
                                    >
                                        {ctaCopiado ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                        Copiar
                                    </button>
                                </div>
                            </div>

                            <textarea
                                value={ctaMensaje}
                                onChange={e => setCtaMensaje(e.target.value)}
                                rows={3}
                                maxLength={120}
                                placeholder="Escribe o genera un mensaje contextual rotario para acompañar la publicación en los grupos…"
                                className="w-full text-xs p-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-rotary-blue focus:outline-none transition-all resize-none leading-relaxed"
                            />

                            <div className="flex items-center justify-between text-[11px] text-gray-500">
                                <span className="flex items-center gap-1">
                                    {tieneEmojiFinal ? (
                                        <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                            <Check className="w-3 h-3" /> Termina en emoji
                                        </span>
                                    ) : (
                                        <span className="text-amber-600 font-semibold flex items-center gap-1">
                                            Recomendado terminar en un emoji rotario (ej. 🌎, 💧, 🤝)
                                        </span>
                                    )}
                                </span>
                                <span className={`font-bold ${ctaMensaje.length > 100 ? 'text-red-500' : 'text-gray-400'}`}>
                                    {ctaMensaje.length} / 100
                                </span>
                            </div>
                        </div>

                        {/* Barra de filtros rápidos y administración */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {categoriasListas.map(cat => (
                                        <button
                                            key={cat}
                                            type="button"
                                            onClick={() => seleccionarCategoria(cat)}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                                filtroCategoria === cat
                                                    ? 'bg-rotary-blue text-white shadow-xs'
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200/80 hover:text-gray-900'
                                            }`}
                                        >
                                            {cat}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                                    <div className="relative flex-1 sm:w-52">
                                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Buscar grupos..."
                                            value={busqueda}
                                            onChange={e => setBusqueda(e.target.value)}
                                            className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-rotary-blue focus:outline-none transition-all"
                                        />
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => setMostrarAdminGrupos(true)}
                                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:text-blue-700 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                                        title="Administrar grupos de Facebook"
                                    >
                                        <Settings className="w-3.5 h-3.5 text-gray-500" />
                                        <span>Administrar grupos</span>
                                    </button>
                                </div>
                            </div>

                            {/* Conteo y selector */}
                            <div className="flex items-center justify-between text-xs text-gray-500 px-1">
                                <div>
                                    Grupos disponibles: <span className="font-bold text-gray-800">{gruposFiltrados.length}</span> ·
                                    Seleccionados: <span className="font-bold text-rotary-blue">{seleccion.size}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={seleccionarVisibles}
                                        className="font-bold text-rotary-blue hover:underline cursor-pointer"
                                    >
                                        Seleccionar todos
                                    </button>
                                    <span className="text-gray-300">|</span>
                                    <button
                                        type="button"
                                        onClick={deseleccionarTodos}
                                        className="font-bold text-gray-500 hover:text-gray-800 hover:underline cursor-pointer"
                                    >
                                        Deseleccionar
                                    </button>
                                </div>
                            </div>

                            {/* Lista scrolleable de grupos */}
                            {cargando ? (
                                <div className="py-10 flex flex-col items-center justify-center gap-2 text-gray-400">
                                    <Loader2 className="w-6 h-6 animate-spin text-rotary-blue" />
                                    <p className="text-xs">Consultando grupos autorizados...</p>
                                </div>
                            ) : errorCarga ? (
                                <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center justify-between">
                                    <span>{errorCarga}</span>
                                    <button
                                        type="button"
                                        onClick={cargarGrupos}
                                        className="font-bold hover:underline flex items-center gap-1 cursor-pointer"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" /> Reintentar
                                    </button>
                                </div>
                            ) : grupos.length === 0 ? (
                                <div className="py-8 px-4 text-center border border-dashed border-blue-200 bg-blue-50/20 rounded-2xl space-y-3">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 text-rotary-blue flex items-center justify-center mx-auto">
                                        <Users className="w-5 h-5" />
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold text-gray-900">
                                            Aún no has registrado tus grupos reales de Facebook
                                        </p>
                                        <p className="text-[11px] text-gray-500 max-w-sm mx-auto">
                                            Carga de inmediato los 36 grupos de tu cuenta para comenzar a difundir en la lista <strong>Rotary en Español</strong>.
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-center gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                setCargandoSeed(true);
                                                try {
                                                    const queryParams = new URLSearchParams();
                                                    if (clubId) queryParams.set('clubId', clubId);
                                                    const seedRes = await fetch(`${API}/social/share/groups/seed-account-groups?${queryParams.toString()}`, {
                                                        method: 'POST',
                                                        headers: authHeaders(),
                                                    });
                                                    if (seedRes.ok) {
                                                        toast.success('¡36 grupos reales cargados con éxito! 👥');
                                                        await cargarGrupos();
                                                    }
                                                } catch {
                                                    toast.error('No se pudieron cargar los grupos');
                                                } finally {
                                                    setCargandoSeed(false);
                                                }
                                            }}
                                            disabled={cargandoSeed}
                                            className="px-4 py-2 rounded-xl text-xs font-bold bg-rotary-blue text-white hover:bg-rotary-navy transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                        >
                                            {cargandoSeed ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                            Cargar los 36 grupos reales de la cuenta
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setMostrarAdminGrupos(true)}
                                            className="px-3 py-2 rounded-xl text-xs font-bold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-all shadow-2xs inline-flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <Settings className="w-3.5 h-3.5" />
                                            Administrar grupos
                                        </button>
                                    </div>
                                </div>
                            ) : gruposFiltrados.length === 0 ? (
                                <div className="py-10 text-center text-gray-400 text-xs border border-dashed border-gray-200 rounded-2xl">
                                    No se encontraron grupos autorizados con el filtro «{filtroCategoria}».
                                </div>
                            ) : (
                                <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                                    {gruposFiltrados.map(g => {
                                        const selected = seleccion.has(g.groupId);
                                        return (
                                            <div
                                                key={g.groupId}
                                                onClick={() => g.canPublish && toggleGrupo(g.groupId)}
                                                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
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
                        </div>

                        {/* Indicador de lotes seguros contra anti-spam de Meta */}
                        {lotes.length > 1 && (
                            <div className="p-3 bg-blue-50/80 border border-blue-200/80 rounded-2xl flex items-center justify-between gap-3 text-xs text-blue-900">
                                <div className="flex items-center gap-2 font-bold">
                                    <Shield className="w-4 h-4 text-blue-600 shrink-0" />
                                    <span>
                                        {seleccion.size} grupos en {lotes.length} lotes seguros de hasta {batchSize}
                                    </span>
                                </div>
                                <span className="text-[11px] font-medium text-blue-700 shrink-0">
                                    Protección anti-spam de Meta activa 🛡️
                                </span>
                            </div>
                        )}

                        {/* Botón de acción */}
                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-3">
                            <button
                                type="button"
                                onClick={onBack}
                                className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-800 cursor-pointer"
                            >
                                Cancelar
                            </button>

                            <button
                                type="button"
                                onClick={iniciarDistribucion}
                                disabled={distribuyendo || seleccion.size === 0}
                                className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-rotary-blue hover:bg-rotary-navy disabled:opacity-40 disabled:cursor-not-allowed shadow-xs transition-all flex items-center gap-2 cursor-pointer"
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

                    {/* Columna Derecha (5/12): Vista Previa Fiel a Facebook Group */}
                    <div className="lg:col-span-5 space-y-2 sticky top-0">
                        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
                            <span className="font-bold text-gray-700 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-blue-600" />
                                Vista previa en Grupo de Facebook
                            </span>
                            <span className="text-[11px] text-gray-400">Meta Feed</span>
                        </div>

                        {/* Tarjeta de Facebook Post que simula fielmente la publicación en el grupo */}
                        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden text-gray-900 font-sans">
                            {/* Cabecera del usuario que comparte en el grupo */}
                            <div className="p-3.5 pb-2.5 flex items-center justify-between">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-xs shrink-0 shadow-xs">
                                        {authorName ? authorName.charAt(0).toUpperCase() : 'R'}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-gray-900 truncate">
                                            {authorName || 'Miembro Rotario'}
                                        </p>
                                        <p className="text-[10px] text-gray-500 flex items-center gap-1">
                                            <span>Hace un momento</span>
                                            <span>·</span>
                                            <Users className="w-3 h-3 text-gray-400" />
                                            <span>En el grupo</span>
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Mensaje / CTA introductorio en tiempo real */}
                            <div className="px-3.5 pb-3">
                                {ctaMensaje.trim() ? (
                                    <p className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">
                                        {ctaMensaje}
                                    </p>
                                ) : (
                                    <p className="text-xs text-gray-400 italic">
                                        Escribe o genera un mensaje para acompañar la publicación en el grupo…
                                    </p>
                                )}
                            </div>

                            {/* Publicación incrustada de la Fanpage original */}
                            <div className="mx-3.5 mb-3 border border-gray-200/90 rounded-xl overflow-hidden bg-gray-50/50">
                                {/* Encabezado de la Fanpage */}
                                <div className="p-2.5 bg-white border-b border-gray-100 flex items-center gap-2">
                                    {fanpageAvatar ? (
                                        <img src={fanpageAvatar} alt="Fanpage" className="w-6 h-6 rounded-full object-cover border border-gray-100" />
                                    ) : (
                                        <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold">
                                            f
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-bold text-gray-900 truncate flex items-center gap-1">
                                            {fanpageAccountName || 'Distrito 4281 de RI'}
                                            <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500 text-white text-[8px] text-center leading-2.5 font-bold">✓</span>
                                        </p>
                                        <p className="text-[9px] text-gray-500">Publicación original · Página oficial</p>
                                    </div>
                                </div>

                                {/* Imagen destacada Open Graph */}
                                {featuredImage ? (
                                    <div className="relative aspect-video w-full bg-gray-100 overflow-hidden border-b border-gray-100">
                                        <img
                                            src={featuredImage}
                                            alt={postTitle}
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                (e.target as HTMLElement).style.display = 'none';
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <div className="aspect-video w-full bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center text-gray-400 border-b border-gray-100 p-4 text-center">
                                        <Globe className="w-8 h-8 text-rotary-blue/40" />
                                    </div>
                                )}

                                {/* Metadatos de la tarjeta de enlace */}
                                <div className="p-2.5 bg-white space-y-1">
                                    <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider truncate">
                                        {(canonicalDomain || 'ROTARY4281.ORG').toUpperCase()}
                                    </p>
                                    <p className="text-xs font-bold text-gray-900 line-clamp-2 leading-snug">
                                        {postTitle}
                                    </p>
                                    {articleExcerpt && (
                                        <p className="text-[11px] text-gray-500 line-clamp-1 leading-normal">
                                            {articleExcerpt}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Barra de interacción nativa de Facebook */}
                            <div className="border-t border-gray-100 px-3.5 py-2 flex items-center justify-around text-gray-500 text-[11px] font-semibold bg-gray-50/30">
                                <span className="flex items-center gap-1.5 cursor-default hover:text-gray-700">
                                    <ThumbsUp className="w-3.5 h-3.5" /> Me gusta
                                </span>
                                <span className="flex items-center gap-1.5 cursor-default hover:text-gray-700">
                                    <MessageSquare className="w-3.5 h-3.5" /> Comentar
                                </span>
                                <span className="flex items-center gap-1.5 cursor-default hover:text-gray-700">
                                    <ShareIcon className="w-3.5 h-3.5" /> Compartir
                                </span>
                            </div>
                        </div>

                        <p className="text-[10px] text-gray-400 text-center px-2">
                            Vista previa basada en las especificaciones oficiales de Meta Graph API.
                        </p>
                    </div>
                </div>
            ) : (
                /* Si ya se inició la distribución: vista de resultados y acciones individuales por grupo */
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
                            className="text-[11px] font-bold text-rotary-blue hover:underline cursor-pointer"
                        >
                            Modificar selección o CTA
                        </button>
                    </div>

                    {/* Mensaje CTA que acompaña la distribución */}
                    {ctaMensaje && (
                        <div className="p-3 bg-sky-50/70 border border-sky-100 rounded-xl flex items-center justify-between gap-3 text-xs">
                            <div className="min-w-0">
                                <span className="font-bold text-rotary-blue text-[10px] uppercase tracking-wider block">
                                    Mensaje a compartir en los grupos:
                                </span>
                                <p className="text-gray-800 text-xs truncate mt-0.5">
                                    {ctaMensaje}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={copiarCTA}
                                className="shrink-0 text-xs font-bold px-3 py-1.5 bg-white border border-sky-200 text-rotary-blue hover:bg-sky-50 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                            >
                                {ctaCopiado ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                {ctaCopiado ? 'Copiado' : 'Copiar mensaje'}
                            </button>
                        </div>
                    )}

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
                                            className="px-3 py-1.5 text-xs font-bold text-rotary-blue bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            Compartir en Facebook
                                        </button>
                                    )}

                                    {o.status !== 'published' ? (
                                        <button
                                            type="button"
                                            onClick={() => marcarEstadoGrupo(o.groupId, 'published')}
                                            className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                                            title="Confirmar que se publicó en el grupo"
                                        >
                                            <Check className="w-3.5 h-3.5" />
                                            Confirmar publicado
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => marcarEstadoGrupo(o.groupId, 'pending')}
                                            className="px-2.5 py-1.5 text-xs font-semibold text-gray-400 hover:text-gray-700 rounded-lg transition-colors cursor-pointer"
                                            title="Reabrir estado"
                                        >
                                            Reabrir
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={() => setOutcomes(null)}
                            className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-800 cursor-pointer"
                        >
                            Volver al selector
                        </button>

                        <button
                            type="button"
                            onClick={onDone}
                            className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-rotary-blue hover:bg-rotary-navy shadow-xs cursor-pointer"
                        >
                            Finalizar distribución
                        </button>
                    </div>
                </div>
            )}

            {/* Modal de Administración de Grupos de Facebook */}
            <GroupManagementModal
                isOpen={mostrarAdminGrupos}
                onClose={() => setMostrarAdminGrupos(false)}
                clubId={clubId}
                fanpageAccountName={fanpageAccountName}
                onUpdated={cargarGrupos}
            />
        </div>
    );
};

export default GroupDistributionSection;
