import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Trash2, Search, FileText, ImageIcon,
    Plus, X, Loader2, Copy, ExternalLink,
    LayoutGrid, List, Folder, ChevronRight, Video,
    ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';

interface MediaItem {
    id: string;
    filename: string;
    url: string;
    type: 'image' | 'video' | 'document';
    size: number;
    createdAt: string;
}

interface ClubFolder {
    id: string;
    name: string;
    count: number;
}

const compressImage = async (file: File): Promise<File> => {
    return new Promise((resolve) => {
        if (!file.type.startsWith('image/') || file.type.includes('svg') || file.type.includes('gif')) {
            return resolve(file);
        }
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const max = 1600; // max width/height
            if (width > height && width > max) {
                height = Math.round(height * (max / width));
                width = max;
            } else if (height > max) {
                width = Math.round(width * (max / height));
                height = max;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(file);
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
                if (!blob) return resolve(file);
                // Si la original era png y requiere transparencia se pierde un poco, pero esto fuerza JPEG ligero.
                // Para logos se sube desde ImageDistribution, acá es Media Library general.
                const ext = file.name.split('.').pop() || 'jpg';
                const newName = file.name.replace(new RegExp(`\\.${ext}$`, 'i'), '.jpg');
                const compressed = new File([blob], newName, { type: 'image/jpeg' });
                // Solo usar si realmente redujo tamaño
                resolve(compressed.size < file.size ? compressed : file);
            }, 'image/jpeg', 0.85);
        };
        img.onerror = () => resolve(file);
        img.src = URL.createObjectURL(file);
    });
};

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

    const isSuperAdmin = user?.role === 'administrator';

    useEffect(() => {
        if (isSuperAdmin && !selectedClubId) {
            fetchFolders();
        } else {
            fetchMedia();
        }
    }, [user, selectedClubId]);

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
            const token = localStorage.getItem('rotary_token');
            const url = isSuperAdmin && selectedClubId
                ? `${import.meta.env.VITE_API_URL || '/api'}/media?clubId=${selectedClubId}`
                : `${import.meta.env.VITE_API_URL || '/api'}/media`;

            const response = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` }
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

                const processedFile = await compressImage(file);

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
                        fileSize: processedFile.size
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
            <div className="flex justify-between items-center mb-8">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        {isSuperAdmin && selectedClubId && (
                            <button
                                onClick={handleBackToFolders}
                                className="p-1 hover:bg-gray-100 rounded-lg text-gray-500 transition-all mr-2"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                        )}
                        <h1 className="text-2xl font-bold text-gray-800">
                            {isSuperAdmin && !selectedClubId ? 'Gestión Global de Medios' : 'Librería de Medios'}
                        </h1>
                    </div>
                    <p className="text-gray-500 text-sm">
                        {isSuperAdmin && !selectedClubId
                            ? 'Explora los archivos organizados por club.'
                            : `Gestionando archivos ${selectedClubName ? `de ${selectedClubName}` : 'de tu club'}.`}
                    </p>
                </div>

                {(!isSuperAdmin || selectedClubId) && (
                    <label className="flex items-center gap-2 bg-rotary-blue text-white px-5 py-2.5 rounded-xl hover:bg-sky-800 transition-all font-bold shadow-lg shadow-rotary-blue/20 cursor-pointer disabled:opacity-50">
                        {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                        <span>{isUploading ? 'Subiendo...' : 'Subir Nuevo'}</span>
                        <input type="file" multiple className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                    </label>
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

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                            <Loader2 className="w-10 h-10 text-rotary-blue animate-spin mb-4" />
                            <p className="text-gray-500 font-medium">Cargando archivos...</p>
                        </div>
                    ) : filteredMedia.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-gray-200 text-center">
                            <ImageIcon className="w-16 h-16 text-gray-100 mb-6 mx-auto" />
                            <h3 className="text-lg font-bold text-gray-800">No se encontraron archivos</h3>
                            <p className="text-gray-400 text-sm mt-1 max-w-xs mx-auto">
                                Sube archivos para que aparezcan en esta librería.
                            </p>
                        </div>
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
