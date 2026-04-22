import React, { useState } from 'react';
import { 
    Plus, 
    Trash2, 
    GripVertical, 
    Settings2, 
    Type, 
    Music, 
    Sparkles, 
    Play,
    Loader2
} from 'lucide-react';
import { Reorder, motion } from 'framer-motion';
import MediaPicker from './MediaPicker';
import { toast } from 'sonner';

interface MediaItem {
    id: string;
    filename: string;
    url: string;
    type: 'image' | 'video' | 'document';
}

const VideoCreator: React.FC = () => {
    const [selectedMedia, setSelectedMedia] = useState<MediaItem[]>([]);
    const [showPicker, setShowPicker] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    
    // Config states
    const [config, setConfig] = useState({
        format: '9:16',
        duration: 15,
        transition: 'fade',
        animation: 'ken_burns',
        caption: '',
        music: 'default'
    });

    const handleGenerate = async () => {
        if (selectedMedia.length === 0) {
            toast.error('Selecciona al menos una imagen');
            return;
        }

        setIsGenerating(true);
        const toastId = toast.loading('Enviando proyecto a KIE.ai...');

        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/content-studio/projects`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    images: selectedMedia.map(m => ({ id: m.id, url: m.url })),
                    config
                })
            });

            if (response.ok) {
                toast.success('Proyecto iniciado. El video aparecerá en tu biblioteca pronto.', { id: toastId });
                // Reset form or redirect
            } else {
                toast.error('Error al iniciar el proyecto', { id: toastId });
            }
        } catch (error) {
            toast.error('Error de conexión', { id: toastId });
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Left: Configuration & Preview Area */}
            <div className="lg:col-span-8 flex flex-col gap-6">
                
                {/* Image Selection Area */}
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-black text-gray-900">Imágenes del Video</h3>
                            <p className="text-sm text-gray-500 font-medium">Ordena tus clips arrastrando las tarjetas</p>
                        </div>
                        <button 
                            onClick={() => setShowPicker(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-black text-xs hover:bg-indigo-100 transition-all border border-indigo-100/50"
                        >
                            <Plus className="w-4 h-4" />
                            Agregar Fotos
                        </button>
                    </div>

                    {selectedMedia.length === 0 ? (
                        <div 
                            onClick={() => setShowPicker(true)}
                            className="aspect-[16/5] border-2 border-dashed border-gray-100 rounded-3xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/10 transition-all"
                        >
                            <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center">
                                <Plus className="w-6 h-6 text-gray-300" />
                            </div>
                            <p className="text-sm text-gray-400 font-bold">No hay imágenes seleccionadas</p>
                        </div>
                    ) : (
                        <Reorder.Group 
                            axis="y" 
                            values={selectedMedia} 
                            onReorder={setSelectedMedia}
                            className="space-y-3"
                        >
                            {selectedMedia.map((item) => (
                                <Reorder.Item 
                                    key={item.id} 
                                    value={item}
                                    className="flex items-center gap-4 bg-gray-50 p-3 rounded-2xl border border-gray-100 group"
                                >
                                    <div className="cursor-grab active:cursor-grabbing text-gray-300">
                                        <GripVertical className="w-5 h-5" />
                                    </div>
                                    <div className="w-16 h-16 rounded-xl overflow-hidden shadow-sm">
                                        <img src={item.url} alt={item.filename} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-800 truncate">{item.filename}</p>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">Clip de 3.0s</p>
                                    </div>
                                    <button 
                                        onClick={() => setSelectedMedia(prev => prev.filter(m => m.id !== item.id))}
                                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </Reorder.Item>
                            ))}
                        </Reorder.Group>
                    )}
                </div>

                {/* Additional Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Transitions & Animation */}
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <Settings2 className="w-5 h-5 text-indigo-600" />
                            <h3 className="font-black text-gray-900">Efectos & IA</h3>
                        </div>
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">Transición</label>
                                <select 
                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all font-sans"
                                    value={config.transition}
                                    onChange={(e) => setConfig({...config, transition: e.target.value})}
                                >
                                    <option value="fade">Disolvencia (Fade)</option>
                                    <option value="zoom">Zoom Suave</option>
                                    <option value="slide_left">Deslizar Izquierda</option>
                                    <option value="slide_right">Deslizar Derecha</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">Animación IA</label>
                                <select 
                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all font-sans"
                                    value={config.animation}
                                    onChange={(e) => setConfig({...config, animation: e.target.value})}
                                >
                                    <option value="ken_burns">Efecto Ken Burns (Pan/Zoom)</option>
                                    <option value="motion_ia">Motion Pro AI</option>
                                    <option value="static">Estático (Sin Movimiento)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Audio & Caption */}
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <Music className="w-5 h-5 text-indigo-600" />
                            <h3 className="font-black text-gray-900">Audio & Texto</h3>
                        </div>
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">Música de Fondo</label>
                                <div className="flex gap-2">
                                    <button className="flex-1 py-3 px-4 bg-indigo-50 border border-indigo-100 rounded-xl text-xs font-black text-indigo-700">Explorar Librería</button>
                                    <button className="flex-1 py-3 px-4 bg-gray-50 border border-gray-100 rounded-xl text-xs font-black text-gray-500">Mute</button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">Caption Sugerido</label>
                                <textarea 
                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all font-sans resize-none h-20"
                                    placeholder="Añade un caption para redes sociales..."
                                    value={config.caption}
                                    onChange={(e) => setConfig({...config, caption: e.target.value})}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right: Real-time Export Column */}
            <div className="lg:col-span-4 sticky top-10 flex flex-col gap-6">
                <div className="bg-gray-900 rounded-[32px] p-6 shadow-2xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-tr from-indigo-950/40 via-transparent to-purple-950/20" />
                    
                    {/* Mock Phone View */}
                    <div className="relative aspect-[9/16] bg-black rounded-[24px] border border-gray-800 overflow-hidden flex flex-col items-center justify-center">
                        {isGenerating ? (
                            <div className="flex flex-col items-center gap-4">
                                <Sparkles className="w-12 h-12 text-indigo-400 animate-pulse" />
                                <div className="space-y-1 text-center">
                                    <p className="text-white font-black text-sm uppercase tracking-wider">Generando con IA</p>
                                    <p className="text-indigo-400/60 text-[10px] font-bold">KIE.ai Processing Engine</p>
                                </div>
                            </div>
                        ) : selectedMedia.length > 0 ? (
                            <div className="relative w-full h-full">
                                <img src={selectedMedia[0].url} className="w-full h-full object-cover opacity-60 blur-sm" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Play className="w-16 h-16 text-white/40 group-hover:scale-110 group-hover:text-white/80 transition-all" />
                                </div>
                                <div className="absolute bottom-10 left-6 right-6">
                                    <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden">
                                        <div className="h-full w-1/3 bg-indigo-500 rounded-full" />
                                    </div>
                                    <div className="flex justify-between mt-2">
                                        <span className="text-[10px] font-black text-white/40">00:05</span>
                                        <span className="text-[10px] font-black text-white/40">00:15</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-3">
                                <Type className="w-10 h-10 text-gray-700" />
                                <p className="text-gray-600 text-[10px] font-black uppercase tracking-widest">Vista Previa</p>
                            </div>
                        )}
                    </div>

                    <div className="mt-6 space-y-4 relative z-10">
                        <div className="flex justify-between items-center text-white/60 mb-2">
                            <span className="text-[10px] font-black uppercase tracking-widest">Metadata Export</span>
                            <span className="text-[10px] font-black uppercase tracking-widest">9:16 Vertical</span>
                        </div>
                        <button 
                            onClick={handleGenerate}
                            disabled={selectedMedia.length === 0 || isGenerating}
                            className="w-full bg-white text-gray-900 py-4 rounded-2xl font-black text-lg hover:bg-indigo-50 hover:text-indigo-600 transition-all shadow-xl disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 flex items-center justify-center gap-3"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Procesando...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-5 h-5 text-indigo-600" />
                                    Renderizar Video
                                </>
                            )}
                        </button>
                        <p className="text-[9px] text-white/30 text-center font-bold tracking-tight px-4 leading-relaxed">
                            Al hacer clic, tus imágenes serán procesadas por la infraestructura de KIE.ai para generar el video vertical de 15 segundos.
                        </p>
                    </div>
                </div>
            </div>

            <MediaPicker 
                isOpen={showPicker}
                initialSelection={selectedMedia.map(m => m.id)}
                onClose={() => setShowPicker(false)}
                onSelect={setSelectedMedia}
            />
        </div>
    );
};

export default VideoCreator;
