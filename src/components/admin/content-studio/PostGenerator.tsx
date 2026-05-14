import React, { useState } from 'react';
import { 
    Plus, 
    Trash2, 
    Settings2, 
    Sparkles, 
    Loader2,
    Facebook,
    Instagram,
    Twitter,
    Download,
    Calendar,
    Save,
    Send,
    Layers,
    Image as ImageIcon,
    Highlighter,
    Maximize,
    UserCheck,
    Globe,
    Clock,
    CheckCircle2
} from 'lucide-react';
import MediaPicker from './MediaPicker';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../ui/tabs';

interface MediaItem {
    id: string;
    filename: string;
    url: string;
    type: 'image' | 'video' | 'document';
}

const PostGenerator: React.FC = () => {
    const [selectedImage, setSelectedImage] = useState<MediaItem | null>(null);
    const [showPicker, setShowPicker] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    
    // Config states
    const [config, setConfig] = useState({
        format: 'facebook_portrait',
        qualityHD: true,
        enhanceLighting: true,
        expandBackground: false,
        keepFaces: true,
        interestArea: 'Paz y resolución de conflictos'
    });

    const [generatedContent, setGeneratedContent] = useState({
        facebook: {
            copy: '',
            hashtags: '',
            cta: ''
        },
        instagram: {
            copy: '',
            hashtags: '',
            cta: ''
        },
        x: {
            copy: '',
            hashtags: '',
            cta: ''
        }
    });

    const interestAreas = [
        "Paz y resolución de conflictos",
        "Salud materno infantil",
        "Educación",
        "Medio ambiente",
        "Agua y saneamiento",
        "Desarrollo económico",
        "Prevención de enfermedades"
    ];

    const handleGenerate = async () => {
        if (!selectedImage) {
            toast.error('Selecciona una imagen primero');
            return;
        }

        setIsGenerating(true);
        const toastId = toast.loading('Generando publicación con IA...');

        try {
            // Simulated delay for AI processing
            await new Promise(resolve => setTimeout(resolve, 3000));

            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/content-studio/generate-post`, {
                method: 'POST',
                headers: { 
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    imageId: selectedImage.id,
                    imageUrl: selectedImage.url,
                    config
                })
            });

            if (response.ok) {
                const data = await response.json();
                setGeneratedContent(data.content || {
                    facebook: {
                        copy: "Transformando comunidades a través del servicio rotario 🌎💙\nNuestro club continúa desarrollando acciones que generan impacto positivo en la comunidad.",
                        hashtags: "#Rotary #PeopleOfAction #ServicioRotario",
                        cta: "¡Únete a nosotros!"
                    },
                    instagram: {
                        copy: "Servicio por encima de uno mismo. ✨\n\nHoy compartimos los resultados de nuestro último proyecto en " + config.interestArea + ".",
                        hashtags: "#RotaryInternational #ServiceAboveSelf #RotaryLife",
                        cta: "Link en la bio para saber más"
                    },
                    x: {
                        copy: "Juntos marcamos la diferencia. Acciones reales para un cambio duradero. 🤝 #Rotary #Service",
                        hashtags: "#Rotary #Impact",
                        cta: "Visítanos en clubplatform.org"
                    }
                });
                toast.success('Publicación generada con éxito', { id: toastId });
            } else {
                // Fallback for demo purposes if endpoint doesn't exist yet
                setGeneratedContent({
                    facebook: {
                        copy: "Transformando comunidades a través del servicio rotario 🌎💙\nNuestro club continúa desarrollando acciones que generan impacto positivo en la comunidad.",
                        hashtags: "#Rotary #PeopleOfAction #ServicioRotario",
                        cta: "¡Únete a nosotros!"
                    },
                    instagram: {
                        copy: "Servicio por encima de uno mismo. ✨\n\nHoy compartimos los resultados de nuestro último proyecto en " + config.interestArea + ".",
                        hashtags: "#RotaryInternational #ServiceAboveSelf #RotaryLife",
                        cta: "Link en la bio para saber más"
                    },
                    x: {
                        copy: "Juntos marcamos la diferencia. Acciones reales para un cambio duradero. 🤝 #Rotary #Service",
                        hashtags: "#Rotary #Impact",
                        cta: "Visítanos en clubplatform.org"
                    }
                });
                toast.success('Publicación generada con éxito (Modo Demo)', { id: toastId });
            }
        } catch (error) {
            toast.error('Error al generar el contenido', { id: toastId });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleAction = (type: string) => {
        toast.info(`Acción: ${type} - Funcionalidad en desarrollo`);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Left Column: Selector & Config */}
            <div className="lg:col-span-7 flex flex-col gap-6">
                
                {/* Image Selection Area */}
                <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-lg font-black text-gray-900">Selección de Imagen</h3>
                            <p className="text-sm text-gray-500 font-medium font-sans">Elige la fotografía base para tu publicación</p>
                        </div>
                        {!selectedImage && (
                            <button 
                                onClick={() => setShowPicker(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl font-black text-xs hover:bg-indigo-100 transition-all border border-indigo-100/50"
                            >
                                <Plus className="w-4 h-4" />
                                Biblioteca Multimedia
                            </button>
                        )}
                    </div>

                    {!selectedImage ? (
                        <div 
                            onClick={() => setShowPicker(true)}
                            className="aspect-video border-2 border-dashed border-gray-100 rounded-3xl flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-indigo-200 hover:bg-indigo-50/10 transition-all group"
                        >
                            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center group-hover:scale-110 transition-all">
                                <ImageIcon className="w-8 h-8 text-gray-300" />
                            </div>
                            <div className="text-center">
                                <p className="text-sm text-gray-400 font-bold">No hay imagen seleccionada</p>
                                <p className="text-[10px] text-gray-300 font-black uppercase tracking-widest mt-1">Haz clic para abrir la biblioteca</p>
                            </div>
                        </div>
                    ) : (
                        <div className="relative group rounded-3xl overflow-hidden shadow-2xl border border-gray-100 aspect-video bg-gray-50">
                            <img src={selectedImage.url} alt={selectedImage.filename} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                <button 
                                    onClick={() => setShowPicker(true)}
                                    className="p-3 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/40 transition-all"
                                    title="Cambiar imagen"
                                >
                                    <Layers className="w-6 h-6" />
                                </button>
                                <button 
                                    onClick={() => setSelectedImage(null)}
                                    className="p-3 bg-red-500/20 backdrop-blur-md rounded-full text-red-200 hover:bg-red-500/40 transition-all"
                                    title="Quitar imagen"
                                >
                                    <Trash2 className="w-6 h-6" />
                                </button>
                            </div>
                            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                                <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg">
                                    <p className="text-[10px] font-black text-white uppercase tracking-widest">{selectedImage.filename}</p>
                                </div>
                                <div className="flex gap-1.5">
                                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-lg shadow-green-500/50" />
                                    <div className="w-2 h-2 rounded-full bg-green-500/50" />
                                    <div className="w-2 h-2 rounded-full bg-green-500/20" />
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* AI Configuration */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                                <Settings2 className="w-4 h-4 text-indigo-600" />
                            </div>
                            <h3 className="font-black text-gray-900">Optimización IA</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">Formato de Salida</label>
                                <select 
                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-700 outline-none focus:ring-2 focus:ring-indigo-600/10 focus:border-indigo-600 transition-all font-sans"
                                    value={config.format}
                                    onChange={(e) => setConfig({...config, format: e.target.value})}
                                >
                                    <option value="facebook_portrait">Facebook Portrait (4:5)</option>
                                    <option value="instagram_portrait">Instagram Vertical (9:16)</option>
                                    <option value="x_portrait">X Post Optimizado</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                <button 
                                    onClick={() => setConfig({...config, qualityHD: !config.qualityHD})}
                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${config.qualityHD ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-gray-50 border-gray-100 text-gray-500'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <Highlighter className="w-4 h-4" />
                                        <span className="text-xs font-bold">Calidad HD Ultra</span>
                                    </div>
                                    {config.qualityHD && <CheckCircle2 className="w-4 h-4" />}
                                </button>
                                <button 
                                    onClick={() => setConfig({...config, enhanceLighting: !config.enhanceLighting})}
                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${config.enhanceLighting ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-gray-50 border-gray-100 text-gray-500'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <Sparkles className="w-4 h-4" />
                                        <span className="text-xs font-bold">Mejorar Iluminación</span>
                                    </div>
                                    {config.enhanceLighting && <CheckCircle2 className="w-4 h-4" />}
                                </button>
                                <button 
                                    onClick={() => setConfig({...config, expandBackground: !config.expandBackground})}
                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${config.expandBackground ? 'bg-indigo-50 border-indigo-100 text-indigo-700' : 'bg-gray-50 border-gray-100 text-gray-500'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <Maximize className="w-4 h-4" />
                                        <span className="text-xs font-bold">Expandir Fondo IA</span>
                                    </div>
                                    {config.expandBackground && <CheckCircle2 className="w-4 h-4" />}
                                </button>
                                <button 
                                    onClick={() => setConfig({...config, keepFaces: !config.keepFaces})}
                                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${config.keepFaces ? 'bg-green-50 border-green-100 text-green-700' : 'bg-gray-50 border-gray-100 text-gray-500'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <UserCheck className="w-4 h-4" />
                                        <span className="text-xs font-bold">Mantener Rostros Originales</span>
                                    </div>
                                    {config.keepFaces && <CheckCircle2 className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                                <Globe className="w-4 h-4 text-purple-600" />
                            </div>
                            <h3 className="font-black text-gray-900">Enfoque Rotary</h3>
                        </div>
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">Área de Interés</label>
                                <div className="grid grid-cols-1 gap-2">
                                    {interestAreas.map((area) => (
                                        <button 
                                            key={area}
                                            onClick={() => setConfig({...config, interestArea: area})}
                                            className={`text-left px-4 py-2 rounded-xl text-xs font-bold transition-all ${config.interestArea === area ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                                        >
                                            {area}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Column: Preview & Content */}
            <div className="lg:col-span-5 sticky top-10 flex flex-col gap-6">
                <div className="bg-white rounded-[32px] border border-gray-100 shadow-xl overflow-hidden">
                    <div className="p-6 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
                        <h3 className="font-black text-gray-900 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-indigo-600" />
                            Vista Previa de Publicación
                        </h3>
                        {isGenerating && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 rounded-full">
                                <Loader2 className="w-3 h-3 text-indigo-600 animate-spin" />
                                <span className="text-[10px] font-black text-indigo-600 uppercase tracking-wider">IA Procesando</span>
                            </div>
                        )}
                    </div>

                    <Tabs defaultValue="facebook" className="w-full">
                        <div className="px-6 pt-4">
                            <TabsList className="bg-gray-100/50 p-1 rounded-xl w-full">
                                <TabsTrigger value="facebook" className="flex-1 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-600 font-bold text-xs gap-2 py-2">
                                    <Facebook className="w-3.5 h-3.5" />
                                    Facebook
                                </TabsTrigger>
                                <TabsTrigger value="instagram" className="flex-1 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-pink-600 font-bold text-xs gap-2 py-2">
                                    <Instagram className="w-3.5 h-3.5" />
                                    Instagram
                                </TabsTrigger>
                                <TabsTrigger value="x" className="flex-1 rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-gray-900 font-bold text-xs gap-2 py-2">
                                    <Twitter className="w-3.5 h-3.5" />
                                    X
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        <div className="p-6">
                            <div className="aspect-[4/5] bg-gray-50 rounded-2xl overflow-hidden mb-6 relative border border-gray-100">
                                {selectedImage ? (
                                    <img 
                                        src={selectedImage.url} 
                                        className={`w-full h-full object-cover transition-all duration-700 ${isGenerating ? 'blur-xl scale-110 opacity-50' : 'blur-0 scale-100 opacity-100'}`} 
                                        alt="Preview"
                                    />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-gray-300">
                                        <ImageIcon className="w-12 h-12" />
                                        <p className="text-[10px] font-black uppercase tracking-widest">Esperando imagen...</p>
                                    </div>
                                )}
                                {isGenerating && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-indigo-900/10 backdrop-blur-sm">
                                        <div className="w-16 h-1 w-24 bg-gray-200 rounded-full overflow-hidden">
                                            <div className="h-full w-2/3 bg-indigo-600 rounded-full animate-progress" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-6">
                                {['facebook', 'instagram', 'x'].map((network) => (
                                    <TabsContent key={network} value={network} className="mt-0 space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">Copy Generado</label>
                                            <div className="p-4 bg-gray-50 border border-gray-100 rounded-2xl min-h-[100px] text-sm text-gray-700 font-sans leading-relaxed whitespace-pre-wrap">
                                                {generatedContent[network as keyof typeof generatedContent].copy || (
                                                    <span className="text-gray-300 italic font-medium">El copy se generará automáticamente...</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-4">
                                            <div className="flex-1 space-y-2">
                                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">Hashtags</label>
                                                <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs text-indigo-600 font-bold">
                                                    {generatedContent[network as keyof typeof generatedContent].hashtags || "#Rotary #Service"}
                                                </div>
                                            </div>
                                            <div className="flex-1 space-y-2">
                                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block">CTA Sugerido</label>
                                                <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl text-xs text-green-600 font-bold">
                                                    {generatedContent[network as keyof typeof generatedContent].cta || "¡Contactar!"}
                                                </div>
                                            </div>
                                        </div>
                                    </TabsContent>
                                ))}
                            </div>

                            <div className="mt-8 pt-6 border-t border-gray-50 grid grid-cols-2 gap-3">
                                <button 
                                    onClick={() => handleAction('download')}
                                    className="flex items-center justify-center gap-2 py-3 bg-gray-50 text-gray-700 rounded-xl font-black text-xs hover:bg-gray-100 transition-all"
                                >
                                    <Download className="w-4 h-4" />
                                    Descargar
                                </button>
                                <button 
                                    onClick={() => handleAction('save')}
                                    className="flex items-center justify-center gap-2 py-3 bg-gray-50 text-gray-700 rounded-xl font-black text-xs hover:bg-gray-100 transition-all"
                                >
                                    <Save className="w-4 h-4" />
                                    Guardar Borrador
                                </button>
                                <button 
                                    onClick={() => handleAction('schedule')}
                                    className="flex items-center justify-center gap-2 py-3 bg-indigo-50 text-indigo-700 rounded-xl font-black text-xs hover:bg-indigo-100 transition-all"
                                >
                                    <Calendar className="w-4 h-4" />
                                    Programar
                                </button>
                                <button 
                                    onClick={() => handleAction('queue')}
                                    className="flex items-center justify-center gap-2 py-3 bg-indigo-50 text-indigo-700 rounded-xl font-black text-xs hover:bg-indigo-100 transition-all"
                                >
                                    <Clock className="w-4 h-4" />
                                    Enviar a Cola
                                </button>
                                <button 
                                    disabled={!selectedImage || isGenerating}
                                    onClick={handleGenerate}
                                    className="col-span-2 mt-2 flex items-center justify-center gap-3 py-4 bg-indigo-600 text-white rounded-2xl font-black text-base shadow-xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isGenerating ? (
                                        <>
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                            Generando...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-5 h-5" />
                                            Generar Publicación
                                        </>
                                    )}
                                </button>
                                <button 
                                    onClick={() => handleAction('publish')}
                                    className="col-span-2 flex items-center justify-center gap-3 py-4 bg-gray-900 text-white rounded-2xl font-black text-base shadow-xl hover:bg-black transition-all"
                                >
                                    <Send className="w-5 h-5" />
                                    Publicar Ahora
                                </button>
                            </div>
                        </div>
                    </Tabs>
                </div>
            </div>

            <MediaPicker 
                isOpen={showPicker}
                maxSelection={1}
                onClose={() => setShowPicker(false)}
                onSelect={(items) => {
                    if (items.length > 0) {
                        setSelectedImage(items[0]);
                    }
                }}
            />
        </div>
    );
};

export default PostGenerator;
