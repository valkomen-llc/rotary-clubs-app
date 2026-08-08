import React, { useEffect, useState, useCallback, useMemo } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Trash2, Search, FileText, ImageIcon,
    Plus, X, Loader2, Copy, ExternalLink,
    LayoutGrid, List, Folder, ChevronRight, Video,
    ArrowLeft, FolderPlus, FolderInput, Pencil, Home, CornerLeftUp
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';
import { compressImage } from '../../utils/compressImage';
import { validateFolderName, breadcrumbOf, type FolderRow } from '../../lib/mediaFolders';

interface MediaItem {
    id: string;
    filename: string;
    url: string;
    type: 'image' | 'video' | 'document';
    size: number;
    createdAt: string;
    folderId?: string | null;
}

interface ClubFolder {
    id: string;
    name: string;
    count: number;
}

/** Una carpeta de la Librería, tal como la devuelve el servidor. */
interface LibraryFolder extends FolderRow {
    clubId?: string | null;
}

/** El árbol con los conteos ya repartidos hacia los ancestros. */
interface FolderTreeNode extends LibraryFolder {
    children: FolderTreeNode[];
    ownCount: number;
    totalCount: number;
}

const MediaLibrary: React.FC = () => {
    const { user } = useAuth();
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [folders, setFolders] = useState<ClubFolder[]>([]);
    const [loading, setLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [filterType, setFilterType] = useState<'all' | 'image' | 'video' | 'document'>('all');
    const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
    const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
    const [selectedClubName, setSelectedClubName] = useState<string | null>(null);

    // ── Carpetas de la Librería (v4.738) ──────────────────────────────
    // `currentFolder` es NULL en la raíz del sitio. No se confunde con
    // `selectedClubId`, que es el otro eje: de qué SITIO son los archivos.
    const [libraryFolders, setLibraryFolders] = useState<LibraryFolder[]>([]);
    const [folderTree, setFolderTree] = useState<FolderTreeNode[]>([]);
    const [rootCount, setRootCount] = useState(0);
    const [currentFolder, setCurrentFolder] = useState<string | null>(null);
    const [creatingFolder, setCreatingFolder] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [renaming, setRenaming] = useState<LibraryFolder | null>(null);
    const [movingItem, setMovingItem] = useState<MediaItem | null>(null);
    const [busyFolder, setBusyFolder] = useState(false);

    const isSuperAdmin = user?.role === 'administrator';
    const API = import.meta.env.VITE_API_URL || '/api';
    const token = () => localStorage.getItem('rotary_token');

    /** La ruta de la carpeta abierta, de la raíz hacia adentro. */
    const breadcrumb = useMemo(
        () => breadcrumbOf(libraryFolders, currentFolder),
        [libraryFolders, currentFolder]
    );

    /** Las carpetas que se ven en el nivel actual: las hijas de la abierta. */
    const visibleFolders = useMemo(() => {
        if (!currentFolder) return folderTree;
        const find = (nodes: FolderTreeNode[]): FolderTreeNode | null => {
            for (const n of nodes) {
                if (n.id === currentFolder) return n;
                const hit = find(n.children);
                if (hit) return hit;
            }
            return null;
        };
        return find(folderTree)?.children ?? [];
    }, [folderTree, currentFolder]);

    // El árbol y los archivos se piden por separado: cambiar de carpeta sólo
    // cambia los ARCHIVOS, así que volver a traer el árbol en cada navegación
    // sería una consulta por clic para recibir lo mismo.
    useEffect(() => {
        if (isSuperAdmin && !selectedClubId) fetchFolders();
        else fetchLibraryFolders();
    }, [user, selectedClubId]);

    useEffect(() => {
        if (isSuperAdmin && !selectedClubId) return;
        fetchMedia();
    }, [user, selectedClubId, currentFolder]);

    const fetchFolders = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/media/folders`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setFolders(data);
            }
        } catch (error) {
            toast.error('Error al cargar carpetas de clubes');
        } finally {
            setLoading(false);
        }
    };

    const fetchMedia = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (isSuperAdmin && selectedClubId) params.set('clubId', selectedClubId);
            // `root` es la raíz; sin el parámetro el servidor no filtra. Son
            // cosas distintas y por eso se manda siempre uno de los dos.
            params.set('folderId', currentFolder || 'root');

            const response = await fetch(`${API}/media?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token()}` }
            });
            if (response.ok) {
                const data = await response.json();
                setMedia(data);
            }
        } catch (error) {
            toast.error('Error al cargar la librería de medios');
        } finally {
            setLoading(false);
        }
    };

    /** El árbol de carpetas del sitio abierto. */
    const fetchLibraryFolders = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (isSuperAdmin && selectedClubId) params.set('clubId', selectedClubId);
            const res = await fetch(`${API}/media/library-folders?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token()}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            // `?.` en cada eslabón: una respuesta sin `folders` —una versión
            // anterior de la API, un error devuelto como objeto— dejaría la
            // pantalla EN BLANCO, no un aviso.
            setLibraryFolders(data?.folders ?? []);
            setFolderTree(data?.tree ?? []);
            setRootCount(data?.rootCount ?? 0);
        } catch {
            // Sin carpetas la Librería sigue sirviendo: se ve como siempre,
            // con todo en la raíz. Degradar es mejor que no cargar nada.
        }
    }, [API, isSuperAdmin, selectedClubId]);

    const handleCreateFolder = async () => {
        const check = validateFolderName(newFolderName);
        if (!check.ok) { toast.error(check.error!); return; }

        setBusyFolder(true);
        try {
            const res = await fetch(`${API}/media/library-folders`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: check.name,
                    parentId: currentFolder,
                    clubId: isSuperAdmin ? selectedClubId : undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(data?.error || 'No se pudo crear la carpeta'); return; }
            toast.success(`Carpeta «${check.name}» creada`);
            setNewFolderName('');
            setCreatingFolder(false);
            fetchLibraryFolders();
        } catch {
            toast.error('Error de conexión al crear la carpeta');
        } finally {
            setBusyFolder(false);
        }
    };

    const handleRenameFolder = async () => {
        if (!renaming) return;
        const check = validateFolderName(renaming.name);
        if (!check.ok) { toast.error(check.error!); return; }

        setBusyFolder(true);
        try {
            const res = await fetch(`${API}/media/library-folders/${renaming.id}`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: check.name, clubId: isSuperAdmin ? selectedClubId : undefined }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(data?.error || 'No se pudo renombrar'); return; }
            toast.success('Carpeta renombrada');
            setRenaming(null);
            fetchLibraryFolders();
        } catch {
            toast.error('Error de conexión al renombrar');
        } finally {
            setBusyFolder(false);
        }
    };

    const handleDeleteFolder = async (folder: LibraryFolder) => {
        // La confirmación dice lo que va a pasar DE VERDAD: los archivos no se
        // borran, suben un nivel. Prometer otra cosa —en cualquiera de las dos
        // direcciones— es lo que hace que alguien pulse sin querer.
        const where = folder.parentId ? 'a la carpeta que la contiene' : 'a la raíz de la Librería';
        if (!window.confirm(
            `¿Eliminar la carpeta «${folder.name}»?\n\n` +
            `Los archivos y las subcarpetas que tenga adentro NO se eliminan: pasan ${where}.`
        )) return;

        try {
            const params = new URLSearchParams();
            if (isSuperAdmin && selectedClubId) params.set('clubId', selectedClubId);
            const res = await fetch(`${API}/media/library-folders/${folder.id}?${params.toString()}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token()}` },
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(data?.error || 'No se pudo eliminar la carpeta'); return; }

            const moved = (data.movedFiles || 0) + (data.movedFolders || 0);
            toast.success(moved
                ? `Carpeta eliminada · ${data.movedFiles || 0} archivo(s) y ${data.movedFolders || 0} subcarpeta(s) se movieron`
                : 'Carpeta eliminada');
            if (currentFolder === folder.id) setCurrentFolder(folder.parentId ?? null);
            fetchLibraryFolders();
            fetchMedia();
        } catch {
            toast.error('Error de conexión al eliminar la carpeta');
        }
    };

    /** Manda un archivo a otra carpeta. `folderId: null` lo devuelve a la raíz. */
    const moveMediaTo = async (item: MediaItem, folderId: string | null) => {
        try {
            const res = await fetch(`${API}/media/library-folders/move`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mediaIds: [item.id],
                    folderId,
                    clubId: isSuperAdmin ? selectedClubId : undefined,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast.error(data?.error || 'No se pudo mover el archivo'); return; }
            toast.success(folderId ? 'Archivo movido' : 'Archivo devuelto a la raíz');
            setMovingItem(null);
            setSelectedItem(null);
            fetchLibraryFolders();
            fetchMedia();
        } catch {
            toast.error('Error de conexión al mover el archivo');
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setIsUploading(true);
        const token = localStorage.getItem('rotary_token');
        let successCount = 0;
        let errorCount = 0;
        
        const toastId = toast.loading(`Subiendo 0 de ${files.length} archivos...`);

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                toast.loading(`Optimizando y subiendo ${i + 1} de ${files.length}...`, { id: toastId });

                const processedFile = await compressImage(file, { maxDimension: 4096, quality: 1.0 });

                const targetClubId = (isSuperAdmin ? selectedClubId : user?.clubId) || '';
                
                // 1. Obtener Presigned URL
                const presignRes = await fetch(
                    `${import.meta.env.VITE_API_URL || '/api'}/media/presigned-url?fileName=${encodeURIComponent(processedFile.name)}&fileType=${encodeURIComponent(processedFile.type)}&clubId=${targetClubId}`,
                    { headers: { 'Authorization': `Bearer ${token}` } }
                );

                if (!presignRes.ok) {
                    errorCount++;
                    continue;
                }

                const { uploadUrl, fileUrl, key, fileTypeLocal } = await presignRes.json();

                // 2. Subir directo a S3
                const s3Res = await fetch(uploadUrl, {
                    method: 'PUT',
                    headers: { 'Content-Type': processedFile.type },
                    body: processedFile
                });

                if (!s3Res.ok) {
                    errorCount++;
                    continue;
                }

                // 3. Registrar en base de datos
                const saveRes = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/media/save`, {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        clubId: targetClubId,
                        fileName: processedFile.name,
                        fileUrl,
                        s3Key: key,
                        fileType: processedFile.type,
                        fileSize: processedFile.size,
                        // Cae en la carpeta abierta. Quien entró a «Logos» y
                        // pulsó «Subir Nuevo» espera que quede en Logos, no
                        // tener que buscarlo en la raíz y moverlo.
                        folderId: currentFolder,
                    })
                });

                if (saveRes.ok) {
                    successCount++;
                } else {
                    errorCount++;
                }
            }

            toast.dismiss(toastId);

            if (successCount > 0) {
                toast.success(`${successCount} archivo(s) subido(s) con éxito`);
                fetchMedia();
            }
            if (errorCount > 0) {
                toast.error(`Error al subir ${errorCount} archivo(s)`);
            }
        } catch (error) {
            toast.dismiss(toastId);
            toast.error('Error de conexión al subir archivos');
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    };

    const handleDelete = async (item: MediaItem) => {
        if (!window.confirm('¿Estás seguro de eliminar este archivo permanentemente?')) return;

        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/media/${item.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                toast.success('Archivo eliminado');
                setMedia(prev => prev.filter(m => m.id !== item.id));
                setSelectedItem(null);
            }
        } catch (error) {
            toast.error('Error al eliminar');
        }
    };

    const copyToClipboard = (url: string) => {
        navigator.clipboard.writeText(url);
        toast.info('URL copiada al portapapeles');
    };

    const filteredMedia = media.filter(m => {
        const matchesSearch = m.filename.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = filterType === 'all' || m.type === filterType;
        return matchesSearch && matchesType;
    });

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleEnterFolder = (folder: ClubFolder) => {
        setSelectedClubId(folder.id);
        setSelectedClubName(folder.name);
    };

    const handleBackToFolders = () => {
        setSelectedClubId(null);
        setSelectedClubName(null);
        setMedia([]);
    };

    return (
        <AdminLayout>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center">
                        <ImageIcon className="w-6 h-6 text-rotary-blue" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            {isSuperAdmin && selectedClubId && (
                                <button
                                    onClick={handleBackToFolders}
                                    className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 transition-all mr-1"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                </button>
                            )}
                            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
                                {isSuperAdmin && !selectedClubId ? 'Gestión Global de Medios' : 'Librería de Medios'}
                            </h1>
                        </div>
                        <p className="text-sm text-gray-500 mt-1">
                            {isSuperAdmin && !selectedClubId
                                ? 'Explora los archivos organizados por club.'
                                : `Gestionando archivos ${selectedClubName ? `de ${selectedClubName}` : 'de tu club'} · ${media.length} archivos`}
                        </p>
                    </div>
                </div>

                {(!isSuperAdmin || selectedClubId) && (
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => { setCreatingFolder(true); setNewFolderName(''); }}
                            className="flex items-center gap-2 bg-white text-rotary-blue border border-gray-200 px-4 py-2.5 rounded-xl hover:border-rotary-blue hover:bg-sky-50 transition-all font-bold shadow-sm active:scale-95"
                        >
                            <FolderPlus className="w-5 h-5" />
                            <span className="hidden sm:inline">Nueva carpeta</span>
                        </button>
                        <label className="flex items-center gap-2 bg-rotary-blue text-white px-5 py-2.5 rounded-xl hover:bg-sky-800 transition-all font-bold shadow-xl shadow-blue-900/20 cursor-pointer disabled:opacity-50 active:scale-95">
                            {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                            <span>{isUploading ? 'Subiendo...' : 'Subir Nuevo'}</span>
                            <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                        </label>
                    </div>
                )}
            </div>

            {isSuperAdmin && !selectedClubId ? (
                // FOLDERS VIEW
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {loading ? (
                        Array(6).fill(0).map((_, i) => (
                            <div key={i} className="h-24 bg-gray-100 rounded-2xl animate-pulse" />
                        ))
                    ) : folders.length === 0 ? (
                        <div className="col-span-full py-20 text-center bg-white rounded-3xl border border-dashed border-gray-200">
                            <Folder className="w-16 h-16 text-gray-100 mx-auto mb-4" />
                            <p className="text-gray-400 font-bold">No hay clubes registrados</p>
                        </div>
                    ) : (
                        folders.map(folder => (
                            <button
                                key={folder.id}
                                onClick={() => handleEnterFolder(folder)}
                                className="flex items-center justify-between p-6 bg-white rounded-2xl border border-gray-100 hover:border-rotary-blue hover:shadow-xl hover:-translate-y-1 transition-all group"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-sky-50 flex items-center justify-center text-rotary-blue group-hover:bg-rotary-blue group-hover:text-white transition-all">
                                        <Folder className="w-6 h-6" />
                                    </div>
                                    <div className="text-left">
                                        <h3 className="font-bold text-gray-800 group-hover:text-rotary-blue transition-colors">{folder.name}</h3>
                                        <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest">{folder.count} archivos</p>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-rotary-blue" />
                            </button>
                        ))
                    )}
                </div>
            ) : (
                // FILES VIEW
                <>
                    {/* Migaja de pan. Se pinta siempre —también en la raíz—
                        porque es lo que dice DÓNDE va a caer lo que se suba. */}
                    <div className="flex items-center gap-1 flex-wrap mb-5 text-sm">
                        <button
                            onClick={() => setCurrentFolder(null)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${currentFolder ? 'text-gray-500 hover:bg-gray-100' : 'bg-sky-50 text-rotary-blue'}`}
                        >
                            <Home className="w-4 h-4" />
                            Librería
                            {rootCount > 0 && (
                                <span className="text-[10px] font-extrabold text-gray-400">{rootCount}</span>
                            )}
                        </button>
                        {breadcrumb.map((crumb, i) => (
                            <React.Fragment key={crumb.id}>
                                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
                                <button
                                    onClick={() => setCurrentFolder(crumb.id)}
                                    className={`px-3 py-1.5 rounded-lg font-bold transition-all truncate max-w-[200px] ${i === breadcrumb.length - 1 ? 'bg-sky-50 text-rotary-blue' : 'text-gray-500 hover:bg-gray-100'}`}
                                >
                                    {crumb.name}
                                </button>
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Alta de carpeta en línea, dentro del nivel abierto. */}
                    {creatingFolder && (
                        <div className="flex flex-col sm:flex-row gap-3 mb-6 p-4 bg-sky-50/60 border border-sky-100 rounded-2xl">
                            <div className="flex items-center gap-3 flex-1">
                                <FolderPlus className="w-5 h-5 text-rotary-blue flex-shrink-0" />
                                <input
                                    autoFocus
                                    value={newFolderName}
                                    onChange={(e) => setNewFolderName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleCreateFolder();
                                        if (e.key === 'Escape') setCreatingFolder(false);
                                    }}
                                    placeholder={currentFolder ? `Nombre de la subcarpeta en «${breadcrumb[breadcrumb.length - 1]?.name}»` : 'Nombre de la carpeta'}
                                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/10 bg-white font-medium"
                                />
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleCreateFolder}
                                    disabled={busyFolder}
                                    className="px-5 py-2.5 bg-rotary-blue text-white rounded-xl font-bold hover:bg-rotary-navy transition-all disabled:opacity-50"
                                >
                                    {busyFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Crear'}
                                </button>
                                <button
                                    onClick={() => setCreatingFolder(false)}
                                    className="px-4 py-2.5 text-gray-500 rounded-xl font-bold hover:bg-white transition-all"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-col md:flex-row gap-4 mb-8">
                        <div className="relative flex-1">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Buscar archivos..."
                                className="w-full pl-11 pr-4 py-3 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rotary-blue/10 bg-white transition-all shadow-sm font-medium"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="flex gap-2">
                            <div className="flex p-1 bg-gray-100 rounded-xl">
                                <button
                                    onClick={() => setViewMode('grid')}
                                    className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-rotary-blue' : 'text-gray-400'}`}
                                >
                                    <LayoutGrid className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setViewMode('list')}
                                    className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-rotary-blue' : 'text-gray-400'}`}
                                >
                                    <List className="w-4 h-4" />
                                </button>
                            </div>

                            <select
                                className="px-4 py-3 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/10 bg-white text-sm font-bold text-gray-600 shadow-sm"
                                value={filterType}
                                onChange={(e) => setFilterType(e.target.value as any)}
                            >
                                <option value="all">Todos los tipos</option>
                                <option value="image">Imágenes</option>
                                <option value="video">Videos</option>
                                <option value="document">Documentos</option>
                            </select>
                        </div>
                    </div>

                    {/* Las carpetas del nivel, antes de los archivos. Se
                        esconden al buscar: una búsqueda mira archivos, y dejar
                        las carpetas ahí haría creer que el resultado está
                        filtrado por ellas. */}
                    {!searchQuery && visibleFolders.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
                            {visibleFolders.map(folder => (
                                <div
                                    key={folder.id}
                                    onClick={() => setCurrentFolder(folder.id)}
                                    className="group flex items-center justify-between gap-3 p-4 bg-white rounded-2xl border border-gray-100 hover:border-rotary-blue hover:shadow-lg transition-all cursor-pointer"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 flex-shrink-0 group-hover:bg-rotary-blue group-hover:text-white transition-all">
                                            <Folder className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-bold text-gray-800 truncate group-hover:text-rotary-blue transition-colors">{folder.name}</p>
                                            <p className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest">
                                                {folder.totalCount} archivo{folder.totalCount === 1 ? '' : 's'}
                                                {folder.children.length > 0 && ` · ${folder.children.length} subcarpeta${folder.children.length === 1 ? '' : 's'}`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setRenaming({ ...folder }); }}
                                            className="p-2 text-gray-300 hover:text-rotary-blue hover:bg-sky-50 rounded-lg transition-all"
                                            title="Renombrar"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteFolder(folder); }}
                                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                            title="Eliminar carpeta"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                            <Loader2 className="w-10 h-10 text-rotary-blue animate-spin mb-4" />
                            <p className="text-gray-500 font-medium">Cargando archivos...</p>
                        </div>
                    ) : filteredMedia.length === 0 ? (
                        // Una carpeta que sólo tiene subcarpetas NO está vacía.
                        // El cartel de «no hay archivos» a pantalla completa
                        // decía lo contrario y tapaba lo que sí había.
                        visibleFolders.length > 0 && !searchQuery ? (
                            <p className="text-sm text-gray-400 font-medium px-1">
                                {currentFolder ? 'Esta carpeta no tiene archivos sueltos.' : 'No hay archivos fuera de las carpetas.'}
                            </p>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-gray-200 text-center">
                                <ImageIcon className="w-16 h-16 text-gray-100 mb-6 mx-auto" />
                                <h3 className="text-lg font-bold text-gray-800">No se encontraron archivos</h3>
                                <p className="text-gray-400 text-sm mt-1 max-w-xs mx-auto">
                                    {searchQuery
                                        ? 'Ninguno coincide con la búsqueda en esta carpeta.'
                                        : 'Sube archivos para que aparezcan en esta librería.'}
                                </p>
                            </div>
                        )
                    ) : viewMode === 'grid' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                            {filteredMedia.map((item) => (
                                <div
                                    key={item.id}
                                    className={`group relative aspect-square bg-gray-50 rounded-2xl border transition-all overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-1 ${selectedItem?.id === item.id ? 'border-rotary-blue ring-4 ring-rotary-blue/10' : 'border-gray-100'
                                        }`}
                                    onClick={() => setSelectedItem(item)}
                                >
                                    {item.type === 'image' ? (
                                        <img src={item.url} alt={item.filename} className="w-full h-full object-cover" />
                                    ) : item.type === 'video' ? (
                                        <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-gray-900 overflow-hidden relative">
                                            <Video className="w-10 h-10 text-white/20" />
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                                                    <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-white border-b-[6px] border-b-transparent ml-1" />
                                                </div>
                                            </div>
                                            <span className="absolute bottom-2 left-2 right-2 text-[8px] font-bold text-white/50 truncate uppercase tracking-tighter">Video</span>
                                        </div>
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center p-4">
                                            <FileText className="w-10 h-10 text-gray-300" />
                                            <span className="text-[10px] font-bold text-gray-400 mt-2 uppercase tracking-tighter truncate w-full text-center">
                                                {item.filename.split('.').pop()}
                                            </span>
                                        </div>
                                    )}

                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); copyToClipboard(item.url); }}
                                            className="p-2 bg-white text-gray-800 rounded-lg hover:bg-rotary-blue hover:text-white transition-all shadow-lg"
                                            title="Copiar URL"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setMovingItem(item); }}
                                            className="p-2 bg-white text-gray-800 rounded-lg hover:bg-rotary-blue hover:text-white transition-all shadow-lg"
                                            title="Mover a una carpeta"
                                        >
                                            <FolderInput className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                                            className="p-2 bg-white text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-lg"
                                            title="Eliminar"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm overflow-x-auto">
                            <table className="w-full text-left min-w-[600px]">
                                <thead className="bg-gray-50/50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Archivo</th>
                                        <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Tipo</th>
                                        <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Tamaño</th>
                                        <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredMedia.map((item) => (
                                        <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden border border-gray-100">
                                                        {item.type === 'image' ? (
                                                            <img src={item.url} className="w-full h-full object-cover" />
                                                        ) : item.type === 'video' ? (
                                                            <Video className="w-5 h-5 text-rotary-blue" />
                                                        ) : (
                                                            <FileText className="w-5 h-5 text-gray-300" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-800 text-sm truncate max-w-xs">{item.filename}</p>
                                                        <p className="text-[10px] text-gray-400 font-bold">Subido el {new Date(item.createdAt).toLocaleDateString()}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`text-[10px] font-bold uppercase ${item.type === 'image' ? 'text-blue-600' :
                                                        item.type === 'video' ? 'text-purple-600' : 'text-amber-600'
                                                    }`}>
                                                    {item.type}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-gray-500 font-medium">
                                                {formatSize(item.size)}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => copyToClipboard(item.url)} className="p-2 text-gray-400 hover:text-rotary-blue hover:bg-sky-50 rounded-lg transition-all" title="Copiar URL">
                                                        <Copy className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => setMovingItem(item)} className="p-2 text-gray-400 hover:text-rotary-blue hover:bg-sky-50 rounded-lg transition-all" title="Mover a una carpeta">
                                                        <FolderInput className="w-4 h-4" />
                                                    </button>
                                                    <a href={item.url} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-rotary-gold hover:bg-amber-50 rounded-lg transition-all" title="Ver original">
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                    <button onClick={() => handleDelete(item)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all" title="Eliminar">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}

            {/* Renombrar una carpeta */}
            {renaming && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={() => setRenaming(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
                        <h3 className="font-bold text-gray-800 text-lg mb-1">Renombrar carpeta</h3>
                        <p className="text-sm text-gray-500 mb-5">Los archivos que tiene adentro no se mueven.</p>
                        <input
                            autoFocus
                            value={renaming.name}
                            onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleRenameFolder();
                                if (e.key === 'Escape') setRenaming(null);
                            }}
                            className="w-full px-4 py-3 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/10 font-medium mb-5"
                        />
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setRenaming(null)} className="px-4 py-2.5 text-gray-500 rounded-xl font-bold hover:bg-gray-50 transition-all">
                                Cancelar
                            </button>
                            <button
                                onClick={handleRenameFolder}
                                disabled={busyFolder}
                                className="px-5 py-2.5 bg-rotary-blue text-white rounded-xl font-bold hover:bg-rotary-navy transition-all disabled:opacity-50"
                            >
                                {busyFolder ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Mover un archivo a otra carpeta. Se ofrece el árbol COMPLETO,
                no sólo el nivel actual: mover suele ser precisamente sacar el
                archivo de donde está. */}
            {movingItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm" onClick={() => setMovingItem(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()}>
                        <div className="p-6 border-b border-gray-100">
                            <h3 className="font-bold text-gray-800 text-lg">Mover archivo</h3>
                            <p className="text-sm text-gray-500 mt-1 truncate">{movingItem.filename}</p>
                        </div>
                        <div className="p-3 overflow-y-auto">
                            <button
                                onClick={() => moveMediaTo(movingItem, null)}
                                disabled={!movingItem.folderId}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-sky-50 transition-all text-left disabled:opacity-40 disabled:hover:bg-transparent"
                            >
                                <CornerLeftUp className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <span className="font-bold text-gray-700">Raíz de la Librería</span>
                                {!movingItem.folderId && <span className="ml-auto text-[10px] font-extrabold uppercase tracking-widest text-gray-300">Está acá</span>}
                            </button>
                            {folderTree.length === 0 && (
                                <p className="px-4 py-6 text-sm text-gray-400 text-center">
                                    Todavía no hay carpetas. Creá una con «Nueva carpeta».
                                </p>
                            )}
                            {(function renderOptions(nodes: FolderTreeNode[], depth: number): React.ReactNode {
                                return nodes.map(node => (
                                    <React.Fragment key={node.id}>
                                        <button
                                            onClick={() => moveMediaTo(movingItem, node.id)}
                                            disabled={movingItem.folderId === node.id}
                                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-sky-50 transition-all text-left disabled:opacity-40 disabled:hover:bg-transparent"
                                            style={{ paddingLeft: `${16 + depth * 20}px` }}
                                        >
                                            <Folder className="w-4 h-4 text-amber-500 flex-shrink-0" />
                                            <span className="font-bold text-gray-700 truncate">{node.name}</span>
                                            {movingItem.folderId === node.id && (
                                                <span className="ml-auto text-[10px] font-extrabold uppercase tracking-widest text-gray-300">Está acá</span>
                                            )}
                                        </button>
                                        {renderOptions(node.children, depth + 1)}
                                    </React.Fragment>
                                ));
                            })(folderTree, 0)}
                        </div>
                    </div>
                </div>
            )}

            {/* Selection Modal / Sidebar */}
            {selectedItem && (
                <div className="fixed inset-0 z-50 flex items-center justify-end p-4 bg-black/20 backdrop-blur-sm" onClick={() => setSelectedItem(null)}>
                    <div
                        className="bg-white h-full w-full max-w-sm shadow-2xl animate-in slide-in-from-right duration-300 overflow-y-auto"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800">Detalles del Archivo</h3>
                            <button onClick={() => setSelectedItem(null)} className="p-2 hover:bg-white rounded-full text-gray-400 shadow-sm transition-all">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="aspect-square bg-gray-50 rounded-2xl border border-gray-100 mb-6 overflow-hidden flex items-center justify-center">
                                {selectedItem.type === 'image' ? (
                                    <img src={selectedItem.url} className="w-full h-full object-contain" />
                                ) : selectedItem.type === 'video' ? (
                                    <video src={selectedItem.url} controls className="w-full h-full object-contain bg-black" />
                                ) : (
                                    <FileText className="w-20 h-20 text-gray-200" />
                                )}
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-1">Nombre</label>
                                    <p className="font-bold text-gray-800 break-all">{selectedItem.filename}</p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-1">URL Pública</label>
                                    <div className="flex gap-2">
                                        <input
                                            readOnly
                                            value={selectedItem.url}
                                            className="flex-1 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-xs font-medium text-gray-500"
                                        />
                                        <button
                                            onClick={() => copyToClipboard(selectedItem.url)}
                                            className="p-2 bg-rotary-blue text-white rounded-lg hover:bg-sky-800 transition-all font-bold"
                                        >
                                            <Copy className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-1">Tamaño</label>
                                        <p className="text-sm font-bold text-gray-700">{formatSize(selectedItem.size)}</p>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-1">Subido</label>
                                        <p className="text-sm font-bold text-gray-700">{new Date(selectedItem.createdAt).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => handleDelete(selectedItem)}
                                className="w-full mt-10 bg-red-50 text-red-500 py-3.5 rounded-xl font-extrabold hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2 shadow-sm"
                            >
                                <Trash2 className="w-4 h-4" /> Eliminar permanentemente
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default MediaLibrary;
