import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Trash2, Search, FileText, ImageIcon,
    Plus, X, Loader2, Copy, ExternalLink,
    LayoutGrid, List
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';

interface MediaItem {
    id: string;
    filename: string;
    url: string;
    type: 'image' | 'document';
    size: number;
    createdAt: string;
}

const MediaLibrary: React.FC = () => {
    const { user } = useAuth();
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [filterType, setFilterType] = useState<'all' | 'image' | 'document'>('all');
    const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);

    useEffect(() => {
        fetchMedia();
    }, [user]);

    const fetchMedia = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/api/media`, {
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
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('clubId', user?.clubId || '');

        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/api/media/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
            });

            if (response.ok) {
                toast.success('Archivo subido con éxito');
                fetchMedia();
            } else {
                const data = await response.json();
                toast.error(data.error || 'Error al subir archivo');
            }
        } catch (error) {
            toast.error('Error de conexión');
        } finally {
            setIsUploading(false);
        }
    };

    const handleDelete = async (item: MediaItem) => {
        if (!window.confirm('¿Estás seguro de eliminar este archivo permanentemente?')) return;

        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/api/media/${item.id}`, {
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

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Librería de Medios</h1>
                    <p className="text-gray-500 text-sm">Gestiona imágenes y documentos para el sitio web del club.</p>
                </div>
                <label className="flex items-center gap-2 bg-rotary-blue text-white px-5 py-2.5 rounded-xl hover:bg-sky-800 transition-all font-bold shadow-lg shadow-rotary-blue/20 cursor-pointer disabled:opacity-50">
                    {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    <span>{isUploading ? 'Subiendo...' : 'Subir Nuevo'}</span>
                    <input type="file" className="hidden" onChange={handleFileUpload} disabled={isUploading} />
                </label>
            </div>

            <div className="flex flex-col md:flex-row gap-4 mb-8">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar archivos..."
                        className="w-full pl-11 pr-4 py-3 border border-gray-100 rounded-2xl outline-none focus:ring-2 focus:ring-rotary-blue/10 bg-white transition-all shadow-sm"
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
                <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                    <ImageIcon className="w-16 h-16 text-gray-100 mb-6" />
                    <h3 className="text-lg font-bold text-gray-800">No se encontraron archivos</h3>
                    <p className="text-gray-400 text-sm mt-1 max-w-xs text-center">
                        Sube imágenes o documentos para que aparezcan en tu librería.
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
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                    <table className="w-full text-left">
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
                                        <span className={`text-[10px] font-bold uppercase ${item.type === 'image' ? 'text-blue-600' : 'text-amber-600'}`}>
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

            {/* Selection Modal / Sidebar could be added here for detailed info */}
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
                                            className="p-2 bg-rotary-blue text-white rounded-lg hover:bg-sky-800 transition-all"
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
                                className="w-full mt-10 bg-red-50 text-red-500 py-3 rounded-xl font-bold hover:bg-red-500 hover:text-white transition-all flex items-center justify-center gap-2"
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
