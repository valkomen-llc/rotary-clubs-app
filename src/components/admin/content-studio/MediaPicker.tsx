import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
    X,
    Search,
    ImageIcon,
    Plus,
    Loader2,
    CheckCircle2,
    Building2,
    MapPin,
    Briefcase,
    Globe,
    Filter,
    Users,
    GraduationCap,
    Calendar,
    Mic,
    Lightbulb,
    Heart,
    Folder as FolderIcon,
    FileImage
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';
import { isHeicFile } from '../../../lib/heicImages';

// Hosts donde corre la plataforma central (no clubes). Si el usuario está en uno
// de estos hosts Y tiene role=administrator, lo consideramos super admin y
// mostramos los filtros completos de la biblioteca multimedia.
const PLATFORM_HOSTS_FOR_MEDIA = [
    'app.clubplatform.org',
    'clubplatform.org',
    'localhost',
    '127.0.0.1'
];

interface MediaItem {
    id: string;
    filename: string;
    url: string;
    // Miniatura WebP de ~400 px (v4.786). Cadena vacía = «se intentó y no se
    // pudo» (un HEIC heredado); en los dos casos la tarjeta usa el original.
    thumbUrl?: string | null;
    type: 'image' | 'video' | 'document';
    sourceType?: string | null;
    sourceId?: string | null;
    sourceLabel?: string | null;
}

interface MediaSource {
    sourceType: string;
    sourceId: string | null;
    sourceLabel: string;
    imageCount: number;
}

/** Una carpeta de la Librería del sitio. */
interface PickerFolder {
    id: string;
    name: string;
    parentId: string | null;
}

interface MediaPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (items: MediaItem[]) => void;
    maxSelection?: number;
    initialSelection?: string[];
    /**
     * Qué se ofrece. Por omisión imágenes, que es lo que pedían las nueve
     * pantallas que ya lo usaban — este selector nació para eso y estaba
     * fijado en el código. Se abre a `video` porque la campaña de
     * contribución deja poner un video propio: sin esto, el botón
     * «Biblioteca» de ese campo mostraría fotos, que es peor que no tenerlo.
     *
     * `all` NO manda el filtro al servidor, que es distinto de mandarlo
     * vacío: la galería «Rotarios en acción» mezcla fotos y videos en una
     * sola lista y tiene que poder elegir de las dos.
     */
    mediaType?: 'image' | 'video' | 'document' | 'all';
}

// Cada categoría se mapea a un valor de Club.category (excepto district,
// project y platform que tienen tablas propias o son globales). La columna
// Club.category se agregó en v4.342 para permitir esta categorización sin
// tablas adicionales.
type CategoryId =
    | 'all'
    | 'club' | 'association' | 'exchange_program' | 'event' | 'conference' | 'project_fair' | 'foundation'
    | 'district' | 'project' | 'platform';

const CATEGORIES: { id: CategoryId; label: string; icon: React.FC<{ className?: string }>; color: string; bg: string }[] = [
    { id: 'all',              label: 'Todas',         icon: Filter,         color: 'text-gray-600',     bg: 'bg-gray-100' },
    { id: 'club',             label: 'Clubes',        icon: Building2,      color: 'text-blue-700',     bg: 'bg-blue-50' },
    { id: 'association',      label: 'Asociaciones',  icon: Users,          color: 'text-indigo-700',   bg: 'bg-indigo-50' },
    { id: 'exchange_program', label: 'Programas',     icon: GraduationCap,  color: 'text-pink-700',     bg: 'bg-pink-50' },
    { id: 'event',            label: 'Eventos',       icon: Calendar,       color: 'text-orange-700',   bg: 'bg-orange-50' },
    { id: 'conference',       label: 'Conferencias',  icon: Mic,            color: 'text-rose-700',     bg: 'bg-rose-50' },
    { id: 'project_fair',     label: 'Ferias',        icon: Lightbulb,      color: 'text-yellow-700',   bg: 'bg-yellow-50' },
    { id: 'foundation',       label: 'Fundaciones',   icon: Heart,          color: 'text-red-700',      bg: 'bg-red-50' },
    { id: 'district',         label: 'Distritos',     icon: MapPin,         color: 'text-purple-700',   bg: 'bg-purple-50' },
    { id: 'project',          label: 'Proyectos',     icon: Briefcase,      color: 'text-amber-700',    bg: 'bg-amber-50' },
    { id: 'platform',         label: 'Plataforma',    icon: Globe,          color: 'text-emerald-700',  bg: 'bg-emerald-50' }
];

// Cuántas tarjetas se dibujan por tanda. Doce filas de cinco: llena la ventana
// del selector con holgura y deja el documento en un tamaño que el navegador
// maneja. Con 3.295 imágenes dibujadas de una vez, no.
const PAGE_SIZE = 60;

const categoryMeta = (id: string | null | undefined) =>
    CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

const MediaPicker: React.FC<MediaPickerProps> = ({
    isOpen,
    onClose,
    onSelect,
    maxSelection = 5,
    initialSelection = [],
    mediaType = 'image'
}) => {
    // v4.407: detectamos si el usuario es super admin de la plataforma. Si NO
    // lo es (= admin de club/distrito/asociación viendo su propio sitio), los
    // filtros de categoría se ocultan — solo deberían ver la biblioteca de
    // su propio sitio sin opciones de cambiar categoría o cargar otros sitios.
    const { user } = useAuth();
    const isOnClubDomainForMedia = !PLATFORM_HOSTS_FOR_MEDIA.includes(window.location.hostname);
    const isSuperAdmin = !isOnClubDomainForMedia && user?.role === 'administrator';

    const [media, setMedia] = useState<MediaItem[]>([]);
    const [sources, setSources] = useState<MediaSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>(initialSelection);

    const [selectedCategory, setSelectedCategory] = useState<CategoryId>('all');
    const [selectedSourceId, setSelectedSourceId] = useState<string>('');

    // Carpetas de la Librería (v4.738). `currentFolder` NULL = sin filtrar por
    // carpeta, que NO es lo mismo que la raíz: al abrir el selector se ven
    // TODAS las imágenes del sitio, estén sueltas o dentro de una carpeta.
    // Filtrar por la raíz de entrada escondería justamente lo que alguien se
    // tomó el trabajo de ordenar.
    const [folders, setFolders] = useState<PickerFolder[]>([]);
    const [currentFolder, setCurrentFolder] = useState<string | null>(null);

    const API = import.meta.env.VITE_API_URL || '/api';

    // ── Páginas del SERVIDOR (v4.786) ──
    //
    // Hasta v4.785 se pedía la biblioteca ENTERA (3.300+ filas) en una sola
    // respuesta y la ventana era sólo del navegador. Ahora se piden tandas de
    // 200 y el resto llega al hacer scroll: la primera pintura no espera a la
    // fila tres mil. `offset = 0` reemplaza la lista (cambio de filtro);
    // mayor, la extiende.
    const SERVER_PAGE = 200;
    const [hasMore, setHasMore] = useState(false);
    const cargandoMas = useRef(false);

    const fetchMedia = useCallback(async (offset = 0) => {
        if (offset === 0) setLoading(true);
        else if (cargandoMas.current) return;
        cargandoMas.current = offset > 0;
        try {
            const token = localStorage.getItem('rotary_token');
            const params = new URLSearchParams();
            if (mediaType !== 'all') params.set('type', mediaType);
            if (selectedCategory !== 'all') params.set('sourceType', selectedCategory);
            if (selectedSourceId) params.set('sourceId', selectedSourceId);
            if (currentFolder) params.set('folderId', currentFolder);
            if (searchQuery.trim()) params.set('search', searchQuery.trim());
            params.set('limit', String(SERVER_PAGE));
            params.set('offset', String(offset));
            const response = await fetch(`${API}/media?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setHasMore(response.headers.get('X-Media-Has-More') === '1');
                setMedia(prev => offset === 0 ? data : [...prev, ...data]);
            }
        } catch {
            toast.error('Error al cargar la librería');
        } finally {
            setLoading(false);
            cargandoMas.current = false;
        }
    }, [API, mediaType, selectedCategory, selectedSourceId, currentFolder, searchQuery]);

    // El árbol de carpetas del sitio. Si falla, el selector funciona igual: se
    // ven todas las imágenes sin el atajo de las carpetas.
    const fetchFolders = useCallback(async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${API}/media/library-folders`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            setFolders(data?.folders ?? []);
        } catch { /* silent */ }
    }, [API]);

    // Load ALL sources once (no type filter). We slice them client-side for the
    // dropdown so chip counts stay stable regardless of the active category.
    const fetchSources = useCallback(async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${API}/media/sources`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setSources(data);
            }
        } catch { /* silent */ }
    }, [API]);

    useEffect(() => {
        if (!isOpen) return;
        setSelectedIds(initialSelection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Load the full sources list once when the modal opens.
    useEffect(() => {
        if (!isOpen) return;
        fetchSources();
        fetchFolders();
    }, [isOpen, fetchSources, fetchFolders]);

    // Reset the source filter when the user switches category.
    useEffect(() => {
        setSelectedSourceId('');
    }, [selectedCategory]);

    // Sources filtered to the active category — drives the dropdown.
    const sourcesForCategory = useMemo(() => {
        if (selectedCategory === 'all' || selectedCategory === 'platform') return [];
        return sources.filter(s => s.sourceType === selectedCategory);
    }, [sources, selectedCategory]);

    // Debounce media fetch on search input to avoid hammering the API on every keystroke.
    useEffect(() => {
        if (!isOpen) return;
        const handle = setTimeout(fetchMedia, searchQuery ? 250 : 0);
        return () => clearTimeout(handle);
    }, [isOpen, fetchMedia, searchQuery]);

    const toggleSelection = (item: MediaItem) => {
        if (selectedIds.includes(item.id)) {
            setSelectedIds(prev => prev.filter(id => id !== item.id));
            return;
        }
        // Casilla de un solo archivo (un logo, un favicon): elegir otra imagen
        // SUSTITUYE a la anterior. Avisar de que ya se llegó al máximo sería
        // absurdo cuando el máximo es uno: obligaría a deseleccionar primero
        // para poder cambiar de opinión.
        if (maxSelection === 1) {
            setSelectedIds([item.id]);
            return;
        }
        if (selectedIds.length >= maxSelection) {
            toast.warning(`Máximo ${maxSelection} imágenes permitidas`);
            return;
        }
        setSelectedIds(prev => [...prev, item.id]);
    };

    const handleConfirm = () => {
        const selectedItems = media.filter(m => selectedIds.includes(m.id));
        onSelect(selectedItems);
        onClose();
    };

    // Per-category image counts derived from the full sources list. Used to
    // show the badge next to each category chip in the toolbar.
    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = { all: 0 };
        for (const s of sources) {
            counts[s.sourceType] = (counts[s.sourceType] || 0) + s.imageCount;
            counts.all += s.imageCount;
        }
        return counts;
    }, [sources]);

    // ── LA REJILLA SE DIBUJA POR TANDAS ────────────────────────────
    //
    // Se reportó que al bajar no cargaban las imágenes. No era la red ni el
    // servidor: la rejilla dibujaba `media.map(...)` ENTERO, y en este sitio la
    // Biblioteca tiene 3.295 imágenes. Son 3.295 elementos `<img>` en el
    // documento; `loading="lazy"` difiere la descarga pero no la creación, y al
    // desplazarse el navegador dispara una avalancha de peticiones que se
    // atascan entre sí. El resultado son tarjetas en blanco — que además se ven
    // igual que «esta imagen no existe».
    //
    // Se dibuja una tanda y se agrega la siguiente cuando el centinela del
    // final entra en pantalla. Sin librería: es un IntersectionObserver y un
    // contador.
    const [pagina, setPagina] = useState(1);
    // El nodo del centinela vive en ESTADO, no en un useRef (v4.903). El
    // selector queda montado con `isOpen` en falso —así lo usan todas sus
    // pantallas— y al reabrirlo con los mismos filtros TODOS los deps del
    // efecto del observador quedaban idénticos (misma página, mismos 200,
    // mismo hasMore): el efecto no volvía a correr y el IntersectionObserver
    // seguía mirando el centinela DESMONTADO de la apertura anterior. El
    // nuevo no lo observaba nadie: «Mostrar más · quedan 141» con el spinner
    // girando y el scroll muerto, sin un solo error. Con el nodo en estado,
    // cada remontaje del centinela (reabrir, el parpadeo de carga, un cambio
    // de filtro) cambia el dep y el observador se re-engancha al nodo VIVO.
    const [nodoCentinela, setNodoCentinela] = useState<HTMLDivElement | null>(null);

    // Cualquier cambio de filtro empieza de nuevo: conservar la página anterior
    // dejaría al usuario mirando el hueco de una lista que ya no existe.
    useEffect(() => { setPagina(1); }, [selectedCategory, selectedSourceId, currentFolder, searchQuery]);
    // Y reabrir el selector también: es otra visita, no la continuación de la
    // anterior — remontar 300 tarjetas de golpe haría lenta la primera pintura.
    useEffect(() => { if (isOpen) setPagina(1); }, [isOpen]);

    const visibles = useMemo(() => media.slice(0, pagina * PAGE_SIZE), [media, pagina]);
    // «Faltan» ahora cuenta también lo que el servidor aún no mandó: sin eso el
    // centinela se apagaba al agotar lo cargado y el scroll moría en la fila 200.
    const faltan = (media.length - visibles.length) + (hasMore ? 1 : 0);

    // El avance es UNO, lo dispare el observador o el botón: hasta v4.902 el
    // botón sólo movía la ventana local y nunca pedía la tanda siguiente al
    // servidor — al agotar las 200 cargadas decía «quedan 1» para siempre.
    const avanzar = useCallback(() => {
        setPagina(p => p + 1);
        // La página siguiente del servidor se pide ANTES de agotar la local:
        // el margen de 600 px + esta anticipación hacen el scroll continuo.
        if (hasMore && (pagina + 1) * PAGE_SIZE >= media.length - PAGE_SIZE) {
            fetchMedia(media.length);
        }
    }, [hasMore, pagina, media.length, fetchMedia]);

    useEffect(() => {
        if (!nodoCentinela || faltan <= 0) return;
        const obs = new IntersectionObserver(
            entradas => {
                if (!entradas.some(e => e.isIntersecting)) return;
                avanzar();
            },
            // Un margen generoso: la tanda siguiente se pide ANTES de llegar al
            // final, así el desplazamiento no se corta.
            { root: null, rootMargin: '600px' }
        );
        obs.observe(nodoCentinela);
        return () => obs.disconnect();
    }, [nodoCentinela, faltan, avanzar]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-5xl max-h-[88vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">Biblioteca Multimedia</h3>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-0.5">
                            {selectedIds.length} de {maxSelection} seleccionadas
                            {media.length > 0 && ` · ${media.length} imagen${media.length !== 1 ? 'es' : ''} en vista`}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Category chips — v4.407: solo visibles para super admins.
                    Admins de club/distrito/asociación ven directamente las
                    imágenes de su propio sitio sin opciones de cambiar
                    categoría (el backend ya filtra por clubId). */}
                {isSuperAdmin && (
                    <div className="px-4 pt-3 pb-2 bg-white border-b border-gray-50 flex gap-1.5 overflow-x-auto scrollbar-hide">
                        {CATEGORIES.map(cat => {
                            const Icon = cat.icon;
                            const active = selectedCategory === cat.id;
                            const count = categoryCounts[cat.id] || 0;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black whitespace-nowrap transition-all border flex-shrink-0 ${
                                        active
                                            ? `${cat.bg} ${cat.color} border-current shadow-sm`
                                            : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
                                    }`}
                                >
                                    <Icon className="w-3 h-3" />
                                    <span className="uppercase tracking-wide">{cat.label}</span>
                                    {count > 0 && (
                                        <span className={`text-[9px] px-1 py-0.5 rounded ${active ? 'bg-white/70' : 'bg-gray-200 text-gray-600'}`}>
                                            {count > 999 ? `${Math.floor(count / 1000)}k` : count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Source filter + search */}
                <div className="p-4 bg-white border-b border-gray-50 flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por nombre de archivo o sitio..."
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    {isSuperAdmin && selectedCategory !== 'all' && selectedCategory !== 'platform' && (
                        <select
                            value={selectedSourceId}
                            onChange={(e) => setSelectedSourceId(e.target.value)}
                            className="px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all sm:w-72"
                        >
                            <option value="">— Todos los {categoryMeta(selectedCategory).label.toLowerCase()} ({sourcesForCategory.length}) —</option>
                            {sourcesForCategory.map(s => (
                                <option key={`${s.sourceType}:${s.sourceId}`} value={s.sourceId || ''}>
                                    {s.sourceLabel}{s.imageCount > 0 ? ` (${s.imageCount})` : ''}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Carpetas del sitio. Es un FILTRO, no una navegación: no hay
                    migaja de pan ni subniveles porque acá se viene a encontrar
                    una imagen, no a ordenar. Ordenar es la Librería de Medios.
                    Sólo se pinta si el sitio creó alguna. */}
                {folders.length > 0 && (
                    <div className="px-4 py-2.5 bg-white border-b border-gray-50 flex gap-1.5 overflow-x-auto scrollbar-hide items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-300 flex-shrink-0 pr-1">Carpetas</span>
                        <button
                            onClick={() => setCurrentFolder(null)}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black whitespace-nowrap transition-all border flex-shrink-0 ${
                                !currentFolder
                                    ? 'bg-indigo-50 text-indigo-700 border-current shadow-sm'
                                    : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
                            }`}
                        >
                            TODAS
                        </button>
                        {folders.map(f => (
                            <button
                                key={f.id}
                                onClick={() => setCurrentFolder(f.id)}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black whitespace-nowrap transition-all border flex-shrink-0 ${
                                    currentFolder === f.id
                                        ? 'bg-amber-50 text-amber-700 border-current shadow-sm'
                                        : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
                                }`}
                            >
                                <FolderIcon className="w-3 h-3" />
                                <span className="uppercase tracking-wide">{f.name}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Grid */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                            <p className="text-gray-500 font-bold">Cargando biblioteca...</p>
                        </div>
                    ) : media.length === 0 ? (
                        <div className="text-center py-20">
                            <ImageIcon className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                            <p className="text-gray-400 font-bold">No se encontraron imágenes con esos filtros</p>
                            <p className="text-[11px] text-gray-300 mt-1">Probá ajustar la categoría o el buscador</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                            {visibles.map((item) => {
                                const isSelected = selectedIds.includes(item.id);
                                const meta = categoryMeta(item.sourceType);
                                const MetaIcon = meta.icon;
                                return (
                                    <div
                                        key={item.id}
                                        className={`group relative aspect-square rounded-2xl overflow-hidden cursor-pointer transition-all border-2 ${
                                            isSelected ? 'border-indigo-600 ring-4 ring-indigo-600/10' : 'border-gray-100 hover:border-indigo-200'
                                        }`}
                                        onClick={() => toggleSelection(item)}
                                        title={item.sourceLabel ? `${item.filename} — ${item.sourceLabel}` : item.filename}
                                    >
                                        {/* Un HEIC no lo dibuja ningún navegador salvo Safari.
                                            Se muestra qué es y dónde se arregla, en vez de un
                                            recuadro roto que parece un fallo del selector.
                                            Convertirlo se hace en la Librería de Medios: acá se
                                            viene a elegir una imagen, no a administrar archivos. */}
                                        {isHeicFile({ filename: item.filename }) ? (
                                            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-amber-50 p-2 text-center">
                                                <FileImage className="w-6 h-6 text-amber-400" />
                                                <span className="text-[9px] font-black uppercase tracking-wide text-amber-600">HEIC</span>
                                                <span className="text-[8px] font-bold text-amber-500 leading-tight">Convertilo en la Librería</span>
                                            </div>
                                        ) : !item.url ? (
                                            /* Sin dirección no hay nada que dibujar, y una tarjeta
                                               en blanco se ve IGUAL que una que todavía está
                                               cargando. Se dice cuál de las dos es. */
                                            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-gray-50 p-2 text-center">
                                                <ImageIcon className="w-6 h-6 text-gray-300" />
                                                <span className="text-[8px] font-bold text-gray-400 leading-tight">Sin archivo</span>
                                            </div>
                                        ) : (
                                            <img src={item.thumbUrl || item.url} alt={item.filename} className="w-full h-full object-cover bg-gray-50" loading="lazy" decoding="async"
                                                onError={e => {
                                                    // Una imagen que el navegador no puede traer deja
                                                    // el hueco vacío. Se marca, en vez de dejar una
                                                    // tarjeta muda que parece un fallo del selector.
                                                    const el = e.currentTarget;
                                                    el.style.display = 'none';
                                                    el.parentElement?.classList.add('bg-gray-100');
                                                    el.parentElement?.setAttribute('data-media-error', '1');
                                                }} />
                                        )}

                                        <div className={`absolute inset-0 bg-black/20 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />

                                        {/* Source category badge */}
                                        {item.sourceType && (
                                            <div className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wide ${meta.bg} ${meta.color} shadow-sm backdrop-blur-sm`}>
                                                <MetaIcon className="w-3 h-3" />
                                                {meta.label}
                                            </div>
                                        )}

                                        {/* Selection toggle */}
                                        <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                            isSelected ? 'bg-indigo-600 border-indigo-600 scale-110' : 'bg-white/40 border-white scale-100'
                                        }`}>
                                            {isSelected ? (
                                                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                            ) : (
                                                <Plus className="w-3.5 h-3.5 text-white" />
                                            )}
                                        </div>

                                        {/* Source label at bottom (only on hover or selected) */}
                                        {item.sourceLabel && (
                                            <div className={`absolute bottom-0 left-0 right-0 px-2 py-1.5 bg-gradient-to-t from-black/80 to-transparent text-white text-[10px] font-bold truncate transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                                {item.sourceLabel}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* El centinela de la tanda siguiente. Va DENTRO del área
                        que se desplaza y con un margen generoso, así la tanda
                        se pide antes de llegar al final y el desplazamiento no
                        se corta. El botón está por si el observador no llega a
                        dispararse —una ventana muy alta, un desplazamiento de
                        un tirón—: quedarse sin salida sería peor. */}
                    {!loading && faltan > 0 && (
                        <div ref={setNodoCentinela} className="flex flex-col items-center gap-2 py-8">
                            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                            <button onClick={avanzar}
                                className="text-[11px] font-bold text-gray-500 hover:text-indigo-600">
                                Mostrar más · quedan {faltan.toLocaleString('es-CO')}
                            </button>
                        </div>
                    )}
                    {!loading && media.length > PAGE_SIZE && faltan === 0 && (
                        <p className="text-center text-[11px] text-gray-400 py-6">
                            Se muestran las {media.length.toLocaleString('es-CO')} imágenes.
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-gray-100 flex justify-end items-center gap-3 bg-gray-50/50">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-200 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={selectedIds.length === 0}
                        className="px-8 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-black disabled:opacity-50 shadow-xl shadow-indigo-600/20 hover:scale-105 transition-all"
                    >
                        Confirmar Selección ({selectedIds.length})
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MediaPicker;
