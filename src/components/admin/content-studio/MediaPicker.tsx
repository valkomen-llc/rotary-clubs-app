import React, { useState, useEffect } from 'react';
import { 
    X, 
    Search, 
    ImageIcon, 
    Plus, 
    Loader2, 
    CheckCircle2,
    Video as VideoIcon
} from 'lucide-react';
import { toast } from 'sonner';

interface MediaItem {
    id: string;
    filename: string;
    url: string;
    type: 'image' | 'video' | 'document';
}

interface MediaPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (items: MediaItem[]) => void;
    maxSelection?: number;
    initialSelection?: string[];
}

const MediaPicker: React.FC<MediaPickerProps> = ({ 
    isOpen, 
    onClose, 
    onSelect, 
    maxSelection = 5,
    initialSelection = []
}) => {
    const [media, setMedia] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>(initialSelection);

    useEffect(() => {
        if (isOpen) {
            fetchMedia();
            setSelectedIds(initialSelection);
        }
    }, [isOpen]);

    const fetchMedia = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/media?type=image`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setMedia(data);
            }
        } catch (error) {
            toast.error('Error al cargar la librería');
        } finally {
            setLoading(false);
        }
    };

    const toggleSelection = (item: MediaItem) => {
        if (selectedIds.includes(item.id)) {
            setSelectedIds(prev => prev.filter(id => id !== item.id));
        } else {
            if (selectedIds.length >= maxSelection) {
                toast.warning(`Máximo ${maxSelection} imágenes permitidas`);
                return;
            }
            setSelectedIds(prev => [...prev, item.id]);
        }
    };

    const handleConfirm = () => {
        const selectedItems = media.filter(m => selectedIds.includes(m.id));
        onSelect(selectedItems);
        onClose();
    };

    if (!isOpen) return null;

    const filteredMedia = media.filter(m => 
        m.filename.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-4xl max-h-[85vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Modal Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h3 className="text-xl font-black text-gray-900">Seleccionar Imágenes</h3>
                        <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-0.5">
                            {selectedIds.length} de {maxSelection} seleccionadas
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-all">
                        <X className="w-5 h-5 text-gray-400" />
                    </button>
                </div>

                {/* Sub-header with Search */}
                <div className="p-4 bg-white border-b border-gray-50 flex gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar en multimedia..."
                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {/* Content - Scrollable Grid */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                            <p className="text-gray-500 font-bold">Cargando biblioteca...</p>
                        </div>
                    ) : filteredMedia.length === 0 ? (
                        <div className="text-center py-20">
                            <ImageIcon className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                            <p className="text-gray-400 font-bold">No se encontraron imágenes</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-4">
                            {filteredMedia.map((item) => {
                                const isSelected = selectedIds.includes(item.id);
                                return (
                                    <div 
                                        key={item.id}
                                        className={`group relative aspect-square rounded-2xl overflow-hidden cursor-pointer transition-all border-2 ${
                                            isSelected ? 'border-indigo-600 ring-4 ring-indigo-600/10' : 'border-gray-100 hover:border-indigo-200'
                                        }`}
                                        onClick={() => toggleSelection(item)}
                                    >
                                        <img src={item.url} alt={item.filename} className="w-full h-full object-cover" />
                                        
                                        {/* Selection Indicators */}
                                        <div className={`absolute inset-0 bg-black/20 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} />
                                        
                                        <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                                            isSelected ? 'bg-indigo-600 border-indigo-600 scale-110' : 'bg-white/40 border-white scale-100'
                                        }`}>
                                            {isSelected ? (
                                                <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                                            ) : (
                                                <Plus className="w-3.5 h-3.5 text-white" />
                                            )}
                                        </div>

                                        {isSelected && (
                                            <div className="absolute bottom-2 left-2 px-1.5 py-0.5 bg-indigo-600 rounded-md text-[9px] font-black text-white uppercase">
                                                Seleccionada
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-6 border-t border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <p className="text-sm text-gray-500 font-medium font-sans">
                        Se enviarán las imágenes a <span className="font-bold text-indigo-600">KIE.ai</span> para procesamiento.
                    </p>
                    <div className="flex gap-3">
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
        </div>
    );
};

export default MediaPicker;
