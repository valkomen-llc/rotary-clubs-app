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
    Download, Shield, BookmarkPlus, FastForward, Play, Pause, Square, Zap,
    LayoutGrid, List, Edit3, Info, PlusCircle, Layers
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

    // Guardado rápido de lista de distribución reutilizable
    const [nombreNuevaLista, setNombreNuevaLista] = useState('');
    const [guardandoNuevaLista, setGuardandoNuevaLista] = useState(false);
    const [mostrarCajaNuevaLista, setMostrarCajaNuevaLista] = useState(false);
    const [mostrarMenuAgregarLista, setMostrarMenuAgregarLista] = useState(false);
    const [asignandoALista, setAsignandoALista] = useState(false);

    // Modo de vista: cuadrícula estilo Facebook vs lista en filas
    const [vistaCuadricula, setVistaCuadricula] = useState(true);
    const [sincronizando36, setSincronizando36] = useState(false);

    // Estado para editar la URL directa de un grupo
    const [grupoAEditar, setGrupoAEditar] = useState<ShareGroupTarget | null>(null);
    const [urlEditada, setUrlEditada] = useState('');
    const [guardandoUrl, setGuardandoUrl] = useState(false);

    // Orquestador y Auto-Runner de la cola de distribución
    const [indiceColaActiva, setIndiceColaActiva] = useState<number>(0);
    const [cadenciaSegundos, setCadenciaSegundos] = useState<number>(45);
    const [autoEjecutando, setAutoEjecutando] = useState<boolean>(false);
    const [autoPausado, setAutoPausado] = useState<boolean>(false);
    const [segundosRestantes, setSegundosRestantes] = useState<number>(0);
    const [duracionIntervalo, setDuracionIntervalo] = useState<number>(45);

    // Cargar grupos autorizados desde el backend
    const cargarGrupos = useCallback(async (forzarSync = false) => {
        setCargando(true);
        setErrorCarga(null);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);
            if (forzarSync) queryParams.set('sync', 'true');
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

            // Por defecto mostramos la totalidad de grupos (36 grupos reales de Facebook)
            setFiltroCategoria('Todos');
            const verificadosIds = lista.filter(g => g.canPublish).map(g => g.groupId);
            setSeleccion(new Set(verificadosIds));
        } catch (err: any) {
            setErrorCarga(err.message || 'Error al cargar grupos.');
        } finally {
            setCargando(false);
        }
    }, [clubId]);

    // Sincronizar explícitamente los 36 grupos de Facebook vinculados a la cuenta
    const sincronizar36GruposReales = async () => {
        setSincronizando36(true);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);
            const res = await fetch(`${API}/social/share/groups/sync-36-groups?${queryParams.toString()}`, {
                method: 'POST',
                headers: authHeaders(),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo sincronizar los grupos.');
            toast.success('¡36 grupos reales del Distrito sincronizados con Facebook! 🌐');
            await cargarGrupos(true);
        } catch (e: any) {
            toast.error(e.message || 'Error al sincronizar grupos');
        } finally {
            setSincronizando36(false);
        }
    };

    // Agregar grupos seleccionados a una lista existente
    const agregarSeleccionadosALista = async (nombreLista: string) => {
        if (!seleccion.size) {
            toast.error('Seleccioná al menos un grupo.');
            return;
        }
        setAsignandoALista(true);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);
            const res = await fetch(`${API}/social/share/groups/assign-list?${queryParams.toString()}`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    listName: nombreLista,
                    groupIds: Array.from(seleccion),
                    action: 'add',
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al asignar a lista');
            toast.success(`${seleccion.size} grupos agregados a «${nombreLista}» 📋`);
            setMostrarMenuAgregarLista(false);
            await cargarGrupos();
        } catch (e: any) {
            toast.error(e.message || 'Error al asignar a lista');
        } finally {
            setAsignandoALista(false);
        }
    };

    // Guardar URL de grupo personalizada
    const guardarUrlGrupo = async () => {
        if (!grupoAEditar) return;
        setGuardandoUrl(true);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);
            const res = await fetch(`${API}/social/share/groups/update-group?${queryParams.toString()}`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    groupId: grupoAEditar.groupId,
                    url: urlEditada.trim(),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al actualizar enlace');
            toast.success(`Enlace de «${grupoAEditar.name}» actualizado 🔗`);
            setGrupos(prev => prev.map(g => g.groupId === grupoAEditar.groupId ? { ...g, url: urlEditada.trim() } : g));
            setGrupoAEditar(null);
        } catch (e: any) {
            toast.error(e.message || 'Error al guardar enlace');
        } finally {
            setGuardandoUrl(false);
        }
    };

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
        }
    };

    // Conteo por categoría para las etiquetas
    const conteoPorCategoria = useMemo(() => {
        const mapa: Record<string, number> = { Todos: grupos.length };
        categoriasListas.forEach(cat => {
            if (cat === 'Todos') return;
            if (cat === 'Rotary en Español') {
                mapa[cat] = grupos.filter(g =>
                    g.tags.some(t => t.toLowerCase() === 'rotary en español') ||
                    g.language === 'es' ||
                    g.tags.some(t => /español|espanol/i.test(t))
                ).length;
            } else if (cat === 'Colombia') {
                mapa[cat] = grupos.filter(g =>
                    g.region === 'Colombia' ||
                    g.tags.some(t => /colombia/i.test(t)) ||
                    g.name.toLowerCase().includes('colombia')
                ).length;
            } else if (cat === 'Latinoamérica') {
                mapa[cat] = grupos.filter(g =>
                    g.region === 'Latinoamérica' ||
                    g.tags.some(t => /latinoam|latam|sur/i.test(t)) ||
                    g.name.toLowerCase().includes('latinoam')
                ).length;
            } else if (cat === 'México') {
                mapa[cat] = grupos.filter(g =>
                    g.region === 'México' ||
                    g.tags.some(t => /m[eé]xico/i.test(t)) ||
                    g.name.toLowerCase().includes('méxico') ||
                    g.name.toLowerCase().includes('mexico')
                ).length;
            } else {
                mapa[cat] = grupos.filter(g =>
                    g.tags.some(t => t.toLowerCase() === cat.toLowerCase()) ||
                    (g.region && g.region.toLowerCase() === cat.toLowerCase()) ||
                    g.name.toLowerCase().includes(cat.toLowerCase())
                ).length;
            }
        });
        return mapa;
    }, [grupos, categoriasListas]);

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

    // Guardar selección actual en una nueva lista de distribución reutilizable
    const guardarSeleccionComoLista = async () => {
        if (!nombreNuevaLista.trim()) {
            toast.error('Ingresá un nombre para la lista.');
            return;
        }
        if (!seleccion.size) {
            toast.error('Seleccioná al menos un grupo para la lista.');
            return;
        }
        setGuardandoNuevaLista(true);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);

            const res = await fetch(`${API}/social/share/groups/quick-save-list?${queryParams.toString()}`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    name: nombreNuevaLista.trim(),
                    groupIds: Array.from(seleccion),
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo guardar la lista.');

            toast.success(`Lista «${nombreNuevaLista.trim()}» guardada con ${seleccion.size} grupos 📋`);
            const guardado = nombreNuevaLista.trim();
            setNombreNuevaLista('');
            setMostrarCajaNuevaLista(false);
            await cargarGrupos();
            setFiltroCategoria(guardado);
        } catch (e: any) {
            toast.error(e.message || 'Error al guardar la lista');
        } finally {
            setGuardandoNuevaLista(false);
        }
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
            setIndiceColaActiva(0);
            toast.success(`Distribución preparada para ${elegidos.length} grupos.`);
        } catch (err: any) {
            toast.error(err.message || 'Error al preparar distribución.');
        } finally {
            setDistribuyendo(false);
        }
    };

    const copiarTextoACompartir = () => {
        const texto = ctaMensaje ? `${ctaMensaje}\n\n${fanpagePostUrl}` : fanpagePostUrl;
        navigator.clipboard.writeText(texto).catch(() => {});
        return texto;
    };

    const abrirCompartirGrupo = (o: GroupDistributionOutcome) => {
        const directGroupUrl = o.url || (o.groupId ? `https://www.facebook.com/groups/${o.groupId}` : null);
        const urlToOpen = directGroupUrl || o.dialogUrl || `https://www.facebook.com/groups/${o.groupId}`;
        window.open(urlToOpen, '_blank', 'width=960,height=780,scrollbars=yes,resizable=yes');
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

    const ejecutarPaso = (o: GroupDistributionOutcome) => {
        copiarTextoACompartir();
        abrirCompartirGrupo(o);
        marcarEstadoGrupo(o.groupId, 'published');
    };

    // Iniciar auto-distribución con cadencia anti-spam y avance desatendido
    const iniciarAutoDistribucion = async () => {
        if (!seleccion.size) {
            toast.error('Seleccioná al menos un grupo autorizado.');
            return;
        }

        const elegidos = grupos.filter(g => seleccion.has(g.groupId));
        setDistribuyendo(true);
        try {
            const queryParams = new URLSearchParams();
            if (clubId) queryParams.set('clubId', clubId);

            const res = await fetch(`${API}/social/share/groups/auto-distribute?${queryParams.toString()}`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    entityType,
                    entityId,
                    fanpagePostId,
                    fanpagePostUrl,
                    message: ctaMensaje,
                    intervalSeconds: cadenciaSegundos,
                    jitterSeconds: 10,
                    groups: elegidos.map(g => ({
                        groupId: g.groupId,
                        name: g.name,
                        url: g.url || (g.groupId ? `https://www.facebook.com/groups/${g.groupId}` : null),
                    })),
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo iniciar la auto-distribución.');

            const listaOutcomes: GroupDistributionOutcome[] = data.outcomes || [];
            setOutcomes(listaOutcomes);
            setIndiceColaActiva(0);
            setAutoEjecutando(true);
            setAutoPausado(false);

            if (listaOutcomes.length > 0) {
                // Ejecutar el primer grupo de inmediato
                ejecutarPaso(listaOutcomes[0]);
                toast.success(`Iniciando con «${listaOutcomes[0].name}» 🚀`, { icon: '🤖' });
                if (listaOutcomes.length > 1) {
                    const jitter = Math.floor(Math.random() * 11) - 5;
                    const proximo = Math.max(15, cadenciaSegundos + jitter);
                    setDuracionIntervalo(proximo);
                    setSegundosRestantes(proximo);
                } else {
                    setAutoEjecutando(false);
                }
            }
        } catch (err: any) {
            toast.error(err.message || 'Error al iniciar auto-distribución.');
        } finally {
            setDistribuyendo(false);
        }
    };

    // Temporizador de cuenta regresiva para el Auto-Runner con cadencia anti-spam
    useEffect(() => {
        let timer: any = null;
        if (autoEjecutando && !autoPausado && segundosRestantes > 0) {
            timer = setInterval(() => {
                setSegundosRestantes(prev => Math.max(0, prev - 1));
            }, 1000);
        } else if (autoEjecutando && !autoPausado && segundosRestantes === 0 && outcomes && outcomes.length > 0) {
            const pendientes = outcomes.filter(o => o.status === 'pending');
            if (pendientes.length > 0) {
                const siguiente = pendientes[0];
                ejecutarPaso(siguiente);
                toast.success(`Procesando «${siguiente.name}» 📋`, { icon: '🤖' });

                const quedan = pendientes.length - 1;
                if (quedan > 0) {
                    const jitter = Math.floor(Math.random() * 11) - 5;
                    const proximo = Math.max(15, cadenciaSegundos + jitter);
                    setDuracionIntervalo(proximo);
                    setSegundosRestantes(proximo);
                } else {
                    setAutoEjecutando(false);
                    toast.success('¡Auto-distribución en todos los grupos completada con éxito! 🎉', { duration: 6000 });
                }
            } else {
                setAutoEjecutando(false);
            }
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [autoEjecutando, autoPausado, segundosRestantes, outcomes, cadenciaSegundos]);

    const pausarAuto = () => {
        setAutoPausado(true);
        toast('Temporizador pausado ⏸️');
    };

    const reanudarAuto = () => {
        setAutoPausado(false);
        toast('Temporizador reanudado ▶️');
    };

    const detenerAuto = () => {
        setAutoEjecutando(false);
        setAutoPausado(false);
        setSegundosRestantes(0);
        toast('Auto-distribución detenida ⏹️');
    };

    const enviarAhora = () => {
        setSegundosRestantes(0);
    };

    const conteoOutcomes = useMemo(() => {
        if (!outcomes) return { publicados: 0, pendientes: 0, errores: 0 };
        return {
            publicados: outcomes.filter(o => o.status === 'published').length,
            pendientes: outcomes.filter(o => o.status === 'pending').length,
            errores: outcomes.filter(o => o.status === 'error').length,
        };
    }, [outcomes]);

    const porcentajeProgreso = useMemo(() => {
        if (!outcomes || !outcomes.length) return 0;
        return Math.round((conteoOutcomes.publicados / outcomes.length) * 100);
    }, [outcomes, conteoOutcomes]);

    const grupoActivo = useMemo(() => {
        if (!outcomes || !outcomes.length) return null;
        const pendientes = outcomes.filter(o => o.status === 'pending');
        if (!pendientes.length) return null;
        if (outcomes[indiceColaActiva] && outcomes[indiceColaActiva].status === 'pending') {
            return outcomes[indiceColaActiva];
        }
        return pendientes[0];
    }, [outcomes, indiceColaActiva]);

    const indiceActual = useMemo(() => {
        if (!grupoActivo || !outcomes) return 0;
        const idx = outcomes.findIndex(o => o.groupId === grupoActivo.groupId);
        return idx >= 0 ? idx : 0;
    }, [grupoActivo, outcomes]);

    const distribuirYContinuar = (o: GroupDistributionOutcome) => {
        ejecutarPaso(o);
        setIndiceColaActiva(prev => prev + 1);
        toast.success('¡CTA y enlace copiados! Publicación abierta en Facebook 📋');
    };

    const omitirGrupoActual = () => {
        setIndiceColaActiva(prev => prev + 1);
    };

    const reintentarPendientes = () => {
        setIndiceColaActiva(0);
        setSegundosRestantes(0);
    };

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
                                            {cat} {conteoPorCategoria[cat] !== undefined ? `(${conteoPorCategoria[cat]})` : ''}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                                    <div className="relative flex-1 sm:w-48">
                                        <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            placeholder="Buscar grupos..."
                                            value={busqueda}
                                            onChange={e => setBusqueda(e.target.value)}
                                            className="w-full pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:border-rotary-blue focus:outline-none transition-all"
                                        />
                                    </div>

                                    {/* Selector de modo de vista: Cuadrícula vs Lista */}
                                    <div className="flex items-center bg-gray-100 p-0.5 rounded-xl border border-gray-200">
                                        <button
                                            type="button"
                                            onClick={() => setVistaCuadricula(true)}
                                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                                vistaCuadricula ? 'bg-white text-rotary-blue shadow-2xs font-bold' : 'text-gray-500 hover:text-gray-800'
                                            }`}
                                            title="Vista cuadrícula de tarjetas (Estilo Facebook)"
                                        >
                                            <LayoutGrid className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setVistaCuadricula(false)}
                                            className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                                                !vistaCuadricula ? 'bg-white text-rotary-blue shadow-2xs font-bold' : 'text-gray-500 hover:text-gray-800'
                                            }`}
                                            title="Vista lista detallada"
                                        >
                                            <List className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    {/* Botón sincronizar los 36 grupos de Facebook */}
                                    <button
                                        type="button"
                                        onClick={sincronizar36GruposReales}
                                        disabled={sincronizando36}
                                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-sky-50 text-sky-800 border border-sky-200 hover:bg-sky-100 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0 disabled:opacity-50"
                                        title="Sincronizar y cargar los 36 grupos vinculados a la cuenta de Facebook"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 text-sky-700 ${sincronizando36 ? 'animate-spin' : ''}`} />
                                        <span className="hidden sm:inline">Sincronizar 36 grupos FB</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setMostrarAdminGrupos(true)}
                                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 hover:text-blue-700 shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                                        title="Administrar grupos de Facebook"
                                    >
                                        <Settings className="w-3.5 h-3.5 text-gray-500" />
                                        <span className="hidden sm:inline">Administrar</span>
                                    </button>
                                </div>
                            </div>

                            {/* Banner explicativo del flujo oficial asistido */}
                            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-950 flex items-start gap-2.5 shadow-2xs">
                                <Info className="w-4 h-4 text-rotary-blue shrink-0 mt-0.5" />
                                <div className="space-y-0.5">
                                    <p className="font-bold text-rotary-blue text-[11px]">
                                        Flujo de Distribución Asistida en Grupos de Facebook
                                    </p>
                                    <p className="text-[11px] text-gray-600 leading-relaxed">
                                        Debido a las políticas oficiales de Meta (deprecación de Groups API), las plataformas no pueden publicar automáticamente en grupos ajenos sin intervención humana. Nuestro sistema asiste el proceso: <strong>copia automáticamente el CTA con el enlace oficial al portapapeles</strong> y abre directamente el feed de cada grupo en Facebook para que solo hagas <strong>Pegar (Ctrl+V o Cmd+V)</strong> y <strong>Publicar</strong>.
                                    </p>
                                </div>
                            </div>

                            {/* Conteo y selector */}
                            <div className="flex items-center justify-between text-xs text-gray-500 px-1 flex-wrap gap-2">
                                <div>
                                    Grupos disponibles: <span className="font-bold text-gray-800">{gruposFiltrados.length}</span> ·
                                    Seleccionados: <span className="font-bold text-rotary-blue">{seleccion.size}</span> de {grupos.length}
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {seleccion.size > 0 && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setMostrarCajaNuevaLista(prev => !prev);
                                                    setMostrarMenuAgregarLista(false);
                                                }}
                                                className="font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-2xs text-[11px]"
                                                title="Guardar los grupos seleccionados en una nueva lista de distribución reutilizable"
                                            >
                                                <BookmarkPlus className="w-3.5 h-3.5 text-emerald-600" />
                                                <span>Guardar como nueva lista</span>
                                            </button>

                                            {/* Menú desplegable para agregar a lista existente */}
                                            <div className="relative inline-block">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setMostrarMenuAgregarLista(prev => !prev);
                                                        setMostrarCajaNuevaLista(false);
                                                    }}
                                                    className="font-bold text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg border border-indigo-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-2xs text-[11px]"
                                                >
                                                    <PlusCircle className="w-3.5 h-3.5 text-indigo-600" />
                                                    <span>Agregar a lista existente ▾</span>
                                                </button>

                                                {mostrarMenuAgregarLista && (
                                                    <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-30 p-1 space-y-1 animate-fadeIn">
                                                        <div className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                                            Selecciona una lista:
                                                        </div>
                                                        {categoriasListas.filter(c => c !== 'Todos').map(cat => (
                                                            <button
                                                                key={cat}
                                                                type="button"
                                                                disabled={asignandoALista}
                                                                onClick={() => agregarSeleccionadosALista(cat)}
                                                                className="w-full text-left px-2.5 py-1.5 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-900 rounded-lg transition-colors flex items-center justify-between cursor-pointer"
                                                            >
                                                                <span className="font-semibold">{cat}</span>
                                                                <span className="text-[10px] text-gray-400">+{seleccion.size}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    )}
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

                            {/* Formulario desplegable para guardar lista reutilizable */}
                            {mostrarCajaNuevaLista && seleccion.size > 0 && (
                                <div className="p-3 bg-emerald-50/90 border border-emerald-200 rounded-xl flex items-center justify-between gap-3 text-xs shadow-xs animate-fadeIn">
                                    <div className="flex-1 flex items-center gap-2">
                                        <span className="font-bold text-emerald-900 shrink-0">Nombre de la lista:</span>
                                        <input
                                            type="text"
                                            value={nombreNuevaLista}
                                            onChange={e => setNombreNuevaLista(e.target.value)}
                                            placeholder="Ej. Rotary Colombia Proyectos"
                                            className="flex-1 px-2.5 py-1 bg-white border border-emerald-300 rounded-lg text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    guardarSeleccionComoLista();
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={guardarSeleccionComoLista}
                                            disabled={guardandoNuevaLista || !nombreNuevaLista.trim()}
                                            className="px-3 py-1 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1 shadow-2xs"
                                        >
                                            {guardandoNuevaLista ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                            Guardar lista ({seleccion.size})
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMostrarCajaNuevaLista(false)}
                                            className="px-2 py-1 text-gray-500 hover:text-gray-800 cursor-pointer text-xs"
                                        >
                                            Cancelar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Lista / Cuadrícula de grupos */}
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
                                        onClick={() => cargarGrupos(false)}
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
                                            onClick={sincronizar36GruposReales}
                                            disabled={sincronizando36}
                                            className="px-4 py-2 rounded-xl text-xs font-bold bg-rotary-blue text-white hover:bg-rotary-navy transition-all shadow-xs inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                                        >
                                            {sincronizando36 ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
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
                            ) : vistaCuadricula ? (
                                /* VISTA CUADRÍCULA / TARJETAS (ESTILO FACEBOOK NATIVO) */
                                <div className="max-h-[360px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2.5 pr-1">
                                    {gruposFiltrados.map(g => {
                                        const selected = seleccion.has(g.groupId);
                                        const groupUrl = g.url || (g.groupId ? `https://www.facebook.com/groups/${g.groupId}` : '#');
                                        return (
                                            <div
                                                key={g.groupId}
                                                className={`p-3 rounded-2xl border transition-all flex flex-col justify-between gap-2.5 ${
                                                    !g.canPublish
                                                        ? 'bg-gray-50/70 border-gray-200 opacity-60'
                                                        : selected
                                                            ? 'bg-sky-50/70 border-rotary-blue ring-1 ring-rotary-blue/30 shadow-xs'
                                                            : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-2xs'
                                                }`}
                                            >
                                                <div className="flex items-start gap-2.5">
                                                    <input
                                                        type="checkbox"
                                                        checked={selected}
                                                        disabled={!g.canPublish}
                                                        onChange={() => toggleGrupo(g.groupId)}
                                                        className="w-4 h-4 mt-0.5 rounded text-rotary-blue focus:ring-rotary-blue border-gray-300 cursor-pointer shrink-0"
                                                    />
                                                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                                                        {g.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-bold text-gray-900 leading-tight line-clamp-2" title={g.name}>
                                                            {g.name}
                                                        </p>
                                                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                            <span className="text-[9px] font-bold px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded flex items-center gap-0.5">
                                                                <Users className="w-2.5 h-2.5" />
                                                                {(g.memberCount || 1000).toLocaleString('es-CO')}
                                                            </span>
                                                            <span className="text-[9px] font-bold px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded">
                                                                {g.languageLabel || 'Español'}
                                                            </span>
                                                            {g.tags.slice(0, 2).map(tag => (
                                                                <span key={tag} className="text-[9px] text-gray-400 truncate max-w-[90px]">
                                                                    #{tag}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between pt-2 border-t border-gray-100 text-[11px]">
                                                    <a
                                                        href={groupUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-rotary-blue hover:underline font-semibold flex items-center gap-1 text-[11px]"
                                                        title="Abrir página oficial de este grupo en Facebook"
                                                    >
                                                        <span>Ver grupo</span>
                                                        <ExternalLink className="w-3 h-3" />
                                                    </a>

                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setGrupoAEditar(g);
                                                            setUrlEditada(g.url || '');
                                                        }}
                                                        className="text-gray-400 hover:text-gray-700 flex items-center gap-1 p-1 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
                                                        title="Editar enlace directo de Facebook de este grupo"
                                                    >
                                                        <Edit3 className="w-3 h-3" />
                                                        <span className="text-[10px]">Enlace</span>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                /* VISTA LISTA EN FILAS */
                                <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
                                    {gruposFiltrados.map(g => {
                                        const selected = seleccion.has(g.groupId);
                                        const groupUrl = g.url || (g.groupId ? `https://www.facebook.com/groups/${g.groupId}` : '#');
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
                                                    <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
                                                        {g.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold text-gray-900 truncate">
                                                            {g.name}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded flex items-center gap-1">
                                                                <Users className="w-3 h-3" />
                                                                {(g.memberCount || 1000).toLocaleString('es-CO')} miembros
                                                            </span>
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
                                                    <a
                                                        href={groupUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={e => e.stopPropagation()}
                                                        className="p-1.5 text-gray-400 hover:text-rotary-blue hover:bg-blue-50 rounded-lg transition-colors"
                                                        title="Abrir grupo en Facebook"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                    </a>
                                                    <button
                                                        type="button"
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            setGrupoAEditar(g);
                                                            setUrlEditada(g.url || '');
                                                        }}
                                                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                                                        title="Editar enlace"
                                                    >
                                                        <Edit3 className="w-3.5 h-3.5" />
                                                    </button>
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

                        {/* Selector de Cadencia Anti-Spam e Intervalos */}
                        <div className="p-3.5 bg-gradient-to-r from-sky-50/80 to-blue-50/50 border border-sky-200/80 rounded-2xl space-y-2.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                    <Shield className="w-4 h-4 text-rotary-blue" />
                                    Cadencia Anti-Spam (Intervalo entre grupos)
                                </span>
                                <span className="text-[10px] font-bold text-sky-800 bg-white/90 border border-sky-200 px-2 py-0.5 rounded-md shadow-2xs">
                                    Jitter aleatorio ±10s activo 🛡️
                                </span>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { sec: 30, label: '30s', desc: '⚡ Rápido' },
                                    { sec: 45, label: '45s', desc: '🛡️ Recomendado' },
                                    { sec: 90, label: '90s', desc: '🔒 Máx. Protección' },
                                ].map(opt => (
                                    <button
                                        key={opt.sec}
                                        type="button"
                                        onClick={() => setCadenciaSegundos(opt.sec)}
                                        className={`p-2 rounded-xl text-center border transition-all cursor-pointer ${
                                            cadenciaSegundos === opt.sec
                                                ? 'bg-white border-rotary-blue text-rotary-blue shadow-xs ring-1 ring-rotary-blue/30 font-bold'
                                                : 'bg-white/60 border-gray-200/80 text-gray-600 hover:bg-white hover:text-gray-900'
                                        }`}
                                    >
                                        <div className="text-xs font-bold">{opt.desc}</div>
                                        <div className="text-[10px] opacity-75">{opt.label} por grupo</div>
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-gray-500 leading-normal">
                                Espaciar la publicación protege tu cuenta y la Fanpage de los algoritmos de detección de spam y ráfagas repetitivas de Facebook.
                            </p>
                        </div>

                        {/* Botones de acción */}
                        <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-3 flex-wrap">
                            <button
                                type="button"
                                onClick={onBack}
                                className="px-4 py-2 text-xs font-bold text-gray-500 hover:text-gray-800 cursor-pointer"
                            >
                                Cancelar
                            </button>

                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={iniciarDistribucion}
                                    disabled={distribuyendo || seleccion.size === 0}
                                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer"
                                    title="Avanzar manualmente grupo por grupo confirmando cada paso"
                                >
                                    <Clock className="w-3.5 h-3.5 text-gray-500" />
                                    <span>Modo Asistido ({seleccion.size})</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={iniciarAutoDistribucion}
                                    disabled={distribuyendo || seleccion.size === 0}
                                    className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                                >
                                    {distribuyendo ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Preparando auto-distribución...
                                        </>
                                    ) : (
                                        <>
                                            <Play className="w-4 h-4 fill-white" />
                                            Iniciar Auto-Distribución ({seleccion.size})
                                        </>
                                    )}
                                </button>
                            </div>
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
                /* Si ya se inició la distribución: Cola Orquestada de Distribución con Progreso en Tiempo Real */
                <div className="space-y-4">
                    {/* Barra de progreso global y resumen */}
                    <div className="p-4 bg-white border border-gray-200 rounded-2xl shadow-xs space-y-3">
                        <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                            <div className="flex items-center gap-3 font-bold">
                                <span className="text-gray-900 flex items-center gap-1.5">
                                    <Users className="w-4 h-4 text-rotary-blue" />
                                    Cola de distribución: {outcomes.length} grupos
                                </span>
                                <span className="text-emerald-700 flex items-center gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    Publicados: {conteoOutcomes.publicados}
                                </span>
                                <span className="text-amber-700 flex items-center gap-1">
                                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                                    Pendientes: {conteoOutcomes.pendientes}
                                </span>
                                {conteoOutcomes.errores > 0 && (
                                    <span className="text-rose-700 flex items-center gap-1">
                                        <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                                        Errores: {conteoOutcomes.errores}
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-2.5">
                                <span className="text-xs font-bold text-rotary-blue bg-sky-50 px-2 py-0.5 rounded-md border border-sky-100">
                                    {porcentajeProgreso}% completado
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setOutcomes(null)}
                                    className="text-[11px] font-bold text-gray-500 hover:text-rotary-blue hover:underline cursor-pointer"
                                >
                                    Modificar selección o CTA
                                </button>
                            </div>
                        </div>

                        {/* Barra de progreso visual */}
                        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                            <div
                                className="bg-emerald-500 h-2.5 transition-all duration-500 rounded-full"
                                style={{ width: `${porcentajeProgreso}%` }}
                            />
                        </div>
                    </div>

                    {/* Tarjeta de Orquestación Activa (Paso a Paso o Auto-Runner) */}
                    {grupoActivo ? (
                        <div className={`p-5 rounded-2xl shadow-sm space-y-4 animate-fadeIn transition-all border-2 ${
                            autoEjecutando
                                ? 'bg-gradient-to-br from-indigo-50/90 via-white to-sky-50/50 border-indigo-300 ring-2 ring-indigo-200/50'
                                : 'bg-gradient-to-br from-sky-50/90 via-white to-blue-50/40 border-sky-200'
                        }`}>
                            {/* Cabecera del estado del Runner */}
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2">
                                    <span className={`px-2.5 py-1 text-white rounded-lg text-xs font-bold shadow-2xs ${
                                        autoEjecutando ? 'bg-indigo-600' : 'bg-rotary-blue'
                                    }`}>
                                        Paso {indiceActual + 1} de {outcomes.length}
                                    </span>
                                    {autoEjecutando ? (
                                        <span className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                                            <span className={`w-2 h-2 rounded-full ${autoPausado ? 'bg-amber-500' : 'bg-emerald-500 animate-ping'}`} />
                                            {autoPausado ? 'Auto-Distribución en Pausa ⏸️' : 'Auto-Distribución Activa 🤖'}
                                        </span>
                                    ) : (
                                        <span className="text-xs font-semibold text-gray-700">
                                            Grupo activo en la cola
                                        </span>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    {autoEjecutando && (
                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-white border border-indigo-200 rounded-xl text-xs font-mono font-bold text-indigo-900 shadow-2xs">
                                            <Clock className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                                            <span>Siguiente en: {Math.floor(segundosRestantes / 60)}:{(segundosRestantes % 60).toString().padStart(2, '0')}</span>
                                        </div>
                                    )}
                                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                        Cadencia anti-spam activa
                                    </span>
                                </div>
                            </div>

                            {/* Barra regresiva de cadencia cuando está en auto-runner */}
                            {autoEjecutando && (
                                <div className="space-y-1.5 bg-white/80 p-2.5 rounded-xl border border-indigo-100 shadow-2xs">
                                    <div className="flex items-center justify-between text-[10px] text-gray-500 font-semibold">
                                        <span>Intervalo anti-spam seguro: {duracionIntervalo}s</span>
                                        <span>{segundosRestantes > 0 ? `Restan ${segundosRestantes}s` : '¡Procesando!'}</span>
                                    </div>
                                    <div className="w-full bg-indigo-100 rounded-full h-2 overflow-hidden">
                                        <div
                                            className="bg-indigo-600 h-2 transition-all duration-1000 rounded-full"
                                            style={{
                                                width: `${Math.min(100, Math.round(((duracionIntervalo - segundosRestantes) / duracionIntervalo) * 100))}%`
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <h4 className="text-base font-bold text-gray-900 flex items-center gap-2 flex-wrap">
                                    <span>{grupoActivo.name}</span>
                                    <span className="text-xs font-semibold px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg flex items-center gap-1 font-normal">
                                        <Users className="w-3 h-3 text-blue-600" />
                                        {(grupoActivo.memberCount || 1000).toLocaleString('es-CO')} miembros
                                    </span>
                                </h4>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    {autoEjecutando
                                        ? 'El Auto-Runner abre directamente el feed de cada grupo en Facebook y copia el enlace oficial con el CTA para que solo pegues y confirmes, avanzando secuencialmente con intervalos seguros.'
                                        : 'Al presionar el botón, se copiará automáticamente el CTA en tu portapapeles y se abrirá el feed del grupo para publicar. Luego confirmará y pasará al siguiente de forma inmediata.'}
                                </p>
                            </div>

                            {/* Mensaje CTA activo */}
                            {ctaMensaje && (
                                <div className="p-3 bg-white/90 border border-sky-200/80 rounded-xl flex items-center justify-between gap-3 text-xs shadow-2xs">
                                    <div className="min-w-0">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-rotary-blue block">
                                            CTA a publicar en este grupo:
                                        </span>
                                        <p className="text-gray-800 text-xs truncate mt-0.5 font-medium">
                                            {ctaMensaje}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={copiarCTA}
                                        className="shrink-0 text-xs font-bold px-2.5 py-1 bg-sky-50 border border-sky-200 text-rotary-blue hover:bg-sky-100 rounded-lg flex items-center gap-1.5 cursor-pointer"
                                    >
                                        {ctaCopiado ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        {ctaCopiado ? 'Copiado' : 'Copiar'}
                                    </button>
                                </div>
                            )}

                            {/* Botones de acción del grupo activo según modo */}
                            <div className="flex items-center justify-between gap-3 pt-3 border-t border-sky-100 flex-wrap">
                                {autoEjecutando ? (
                                    /* Controles de Auto-Runner */
                                    <div className="flex items-center justify-between w-full gap-2 flex-wrap">
                                        <div className="flex items-center gap-2">
                                            {autoPausado ? (
                                                <button
                                                    type="button"
                                                    onClick={reanudarAuto}
                                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                                                >
                                                    <Play className="w-3.5 h-3.5 fill-white" />
                                                    <span>Reanudar temporizador</span>
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={pausarAuto}
                                                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                                                >
                                                    <Pause className="w-3.5 h-3.5" />
                                                    <span>Pausar</span>
                                                </button>
                                            )}

                                            <button
                                                type="button"
                                                onClick={enviarAhora}
                                                className="px-3.5 py-2 bg-indigo-50 border border-indigo-200 text-indigo-800 hover:bg-indigo-100 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                                                title="Saltar la espera del temporizador y procesar este grupo de inmediato"
                                            >
                                                <FastForward className="w-3.5 h-3.5 text-indigo-600" />
                                                <span>Enviar ahora (saltar espera)</span>
                                            </button>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={detenerAuto}
                                            className="px-3 py-2 text-xs font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer flex items-center gap-1"
                                        >
                                            <Square className="w-3.5 h-3.5" />
                                            <span>Detener auto-distribución</span>
                                        </button>
                                    </div>
                                ) : (
                                    /* Controles Manuales Asistidos */
                                    <div className="flex items-center justify-between w-full gap-3 flex-wrap">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setAutoEjecutando(true);
                                                    setAutoPausado(false);
                                                    setSegundosRestantes(0);
                                                }}
                                                className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                                            >
                                                <Play className="w-3.5 h-3.5 fill-white" />
                                                <span>Activar Auto-Runner</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => distribuirYContinuar(grupoActivo)}
                                                className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-rotary-blue hover:bg-rotary-navy transition-all shadow-sm flex items-center gap-2 cursor-pointer hover:shadow-md"
                                            >
                                                <ExternalLink className="w-4 h-4" />
                                                <span>Compartir en «{grupoActivo.name}» y continuar ➜</span>
                                            </button>

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    marcarEstadoGrupo(grupoActivo.groupId, 'published');
                                                    setIndiceColaActiva(prev => prev + 1);
                                                }}
                                                className="px-3.5 py-2.5 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                                title="Confirmar que se publicó y avanzar al siguiente"
                                            >
                                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                                <span>Confirmar y avanzar</span>
                                            </button>
                                        </div>

                                        <button
                                            type="button"
                                            onClick={omitirGrupoActual}
                                            className="px-3 py-2 text-xs font-semibold text-gray-500 hover:text-gray-800 transition-colors cursor-pointer flex items-center gap-1"
                                            title="Pasar al siguiente grupo de la cola sin marcar como publicado"
                                        >
                                            <FastForward className="w-3.5 h-3.5" />
                                            <span>Omitir este grupo</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Todos los grupos fueron procesados exitosamente */
                        <div className="p-6 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl text-center space-y-3 shadow-xs animate-fadeIn">
                            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-2xs">
                                <CheckCircle2 className="w-6 h-6" />
                            </div>
                            <div className="space-y-1">
                                <h4 className="text-sm font-bold text-emerald-950">
                                    ¡Distribución completada en todos los grupos seleccionados! 🎉
                                </h4>
                                <p className="text-xs text-emerald-800 max-w-md mx-auto">
                                    Todos los grupos de la lista han sido procesados conforme a las directrices y políticas oficiales de Meta.
                                </p>
                            </div>
                            <div className="pt-2">
                                <button
                                    type="button"
                                    onClick={onDone}
                                    className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all cursor-pointer"
                                >
                                    Finalizar y cerrar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Botón para reintentar pendientes o fallidos cuando corresponda */}
                    {conteoOutcomes.pendientes > 0 && !grupoActivo && (
                        <div className="flex justify-center p-2">
                            <button
                                type="button"
                                onClick={reintentarPendientes}
                                className="px-4 py-2 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-xl transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Reintentar {conteoOutcomes.pendientes} pendientes en la cola
                            </button>
                        </div>
                    )}

                    {/* Listado detallado individual de todos los grupos */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs font-bold text-gray-700 px-1">
                            <span>Detalle individual de la lista ({outcomes.length} grupos):</span>
                            {conteoOutcomes.errores > 0 && (
                                <button
                                    type="button"
                                    onClick={reintentarPendientes}
                                    className="text-[11px] font-bold text-amber-700 hover:underline flex items-center gap-1 cursor-pointer"
                                >
                                    <RefreshCw className="w-3 h-3" />
                                    Reintentar fallidos
                                </button>
                            )}
                        </div>

                        <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                            {outcomes.map((o, idx) => (
                                <div
                                    key={o.groupId}
                                    className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 shadow-2xs ${
                                        grupoActivo?.groupId === o.groupId
                                            ? 'bg-sky-50/70 border-rotary-blue/50 ring-1 ring-rotary-blue/30'
                                            : o.status === 'published'
                                                ? 'bg-emerald-50/30 border-emerald-100'
                                                : 'bg-white border-gray-200'
                                    }`}
                                >
                                    <div className="min-w-0 space-y-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                                #{idx + 1}
                                            </span>
                                            <p className="text-xs font-bold text-gray-900 truncate">
                                                {o.name}
                                            </p>
                                        </div>
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
                                                className="px-2.5 py-1 text-xs font-bold text-rotary-blue bg-sky-50 border border-sky-200 hover:bg-sky-100 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                                Abrir
                                            </button>
                                        )}

                                        {o.status !== 'published' ? (
                                            <button
                                                type="button"
                                                onClick={() => marcarEstadoGrupo(o.groupId, 'published')}
                                                className="px-2.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                                                title="Confirmar que se publicó en el grupo"
                                            >
                                                <Check className="w-3 h-3" />
                                                Confirmar
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => marcarEstadoGrupo(o.groupId, 'pending')}
                                                className="px-2 py-1 text-xs font-semibold text-gray-400 hover:text-gray-700 rounded-lg transition-colors cursor-pointer"
                                                title="Reabrir estado"
                                            >
                                                Reabrir
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
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

            {/* Modal de Edición Directa de Enlace de Facebook de un Grupo */}
            {grupoAEditar && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                                <Edit3 className="w-4 h-4 text-rotary-blue" />
                                <span>Editar enlace oficial del grupo</span>
                            </h3>
                            <button
                                type="button"
                                onClick={() => setGrupoAEditar(null)}
                                className="text-gray-400 hover:text-gray-600 cursor-pointer font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-1">
                            <p className="text-xs font-bold text-gray-800">{grupoAEditar.name}</p>
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                                Pega aquí la dirección URL exacta de Facebook a la que accedes en tu navegador (ejemplo: <code>https://www.facebook.com/groups/123456789/</code>):
                            </p>
                        </div>

                        <input
                            type="url"
                            value={urlEditada}
                            onChange={e => setUrlEditada(e.target.value)}
                            placeholder="https://www.facebook.com/groups/..."
                            className="w-full px-3 py-2 text-xs bg-gray-50 border border-gray-300 rounded-xl focus:bg-white focus:border-rotary-blue focus:outline-none"
                            autoFocus
                        />

                        <div className="flex justify-end items-center gap-2 pt-2 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => setGrupoAEditar(null)}
                                className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 cursor-pointer font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={guardarUrlGrupo}
                                disabled={guardandoUrl || !urlEditada.trim()}
                                className="px-4 py-1.5 text-xs font-bold bg-rotary-blue text-white rounded-xl hover:bg-rotary-navy transition-all shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {guardandoUrl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                Guardar enlace
                            </button>
                        </div>
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
