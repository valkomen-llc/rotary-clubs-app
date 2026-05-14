import React, { useState, useRef } from 'react';
import { 
    Image as ImageIcon, 
    Sparkles, 
    Layout, 
    Zap, 
    Send, 
    RefreshCw, 
    PlusCircle,
    CheckCircle2,
    Upload,
    Library,
    Download,
    Eye,
    MessageSquare,
    BarChart3
} from 'lucide-react';
import MediaPicker from './MediaPicker';
import { toast } from 'sonner';

interface AIConfig {
    format: string;
    interestArea: string;
    type: string; // New: storytelling, standard, etc.
}

interface PostContent {
    copy: string;
    hashtags?: string;
    cta?: string;
}

interface GeneratedData {
    facebook: PostContent;
    instagram: PostContent;
    x: PostContent;
    linkedin: PostContent;
}

const PostGenerator: React.FC = () => {
    const [selectedImage, setSelectedImage] = useState<any>(null);
    const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiConfig, setAiConfig] = useState<AIConfig>({
        format: 'fb_portrait',
        interestArea: 'general',
        type: 'standard'
    });
    const [activePlatform, setActivePlatform] = useState<'facebook' | 'instagram' | 'x' | 'linkedin'>('facebook');
    const [generatedContent, setGeneratedContent] = useState<GeneratedData | null>(null);
    const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleGenerate = async () => {
        if (!selectedImage) {
            toast.error('Por favor selecciona una imagen primero');
            return;
        }

        setIsGenerating(true);
        const toastId = toast.loading('IA Generando Publicación Profesional...');

        try {
            // Force 16:9 if platform is X for better results
            const finalConfig = {
                ...aiConfig,
                format: activePlatform === 'x' ? '16:9' : '9:16'
            };

            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/content-studio/generate-post`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('rotary_token')}`
                },
                body: JSON.stringify({
                    imageId: selectedImage.id || 'uploaded',
                    imageUrl: selectedImage.url,
                    config: finalConfig
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setGeneratedContent(data.content);
                setGeneratedImageUrl(data.generatedImageUrl);
                toast.success('¡Contenido generado con éxito!', { id: toastId });
            } else {
                toast.error(data.error || 'Error al generar el contenido', { id: toastId });
            }
        } catch (error: any) {
            toast.error('Error de conexión', { id: toastId });
        } finally {
            setIsGenerating(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const toastId = toast.loading('Subiendo imagen...');
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/media/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('rotary_token')}` },
                body: formData
            });
            const data = await response.json();
            if (response.ok) {
                setSelectedImage({ id: data.id, url: data.url, name: file.name });
                setGeneratedContent(null);
                toast.success('Imagen lista', { id: toastId });
            }
        } catch (error: any) {
            toast.error('Error al subir', { id: toastId });
        }
    };

    const downloadImage = async () => {
        if (!generatedImageUrl) return;
        try {
            const response = await fetch(generatedImageUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `rotary-post-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            toast.error('Error al descargar');
        }
    };

    return (
        <div className="space-y-6 pb-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 1. Panel de Control */}
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-5 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <ImageIcon className="w-5 h-5 text-blue-600" />
                                Selección de Imagen
                            </h3>
                            <div className="flex gap-2">
                                <button onClick={() => setIsMediaPickerOpen(true)} className="text-[10px] font-black text-blue-600 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 transition-all flex items-center gap-2">
                                    <Library className="w-3.5 h-3.5" /> BIBLIOTECA
                                </button>
                                <button onClick={() => fileInputRef.current?.click()} className="text-[10px] font-black text-blue-600 px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 transition-all flex items-center gap-2">
                                    <Upload className="w-3.5 h-3.5" /> SUBIR
                                </button>
                            </div>
                        </div>

                        <div className="p-6">
                            {selectedImage ? (
                                <div className="space-y-4">
                                    <div className="relative group rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gray-900">
                                        <img src={selectedImage.url} alt="Selected" className="w-full h-auto max-h-[350px] object-contain mx-auto" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <button onClick={() => setIsMediaPickerOpen(true)} className="bg-white text-gray-900 px-5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 shadow-2xl hover:scale-105 transition-transform">
                                                <RefreshCw className="w-4 h-4" /> CAMBIAR IMAGEN
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-center text-[10px] text-gray-400 font-black truncate px-4 tracking-widest">{selectedImage.name?.toUpperCase() || 'IMAGEN CARGADA'}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <button onClick={() => setIsMediaPickerOpen(true)} className="aspect-video border-2 border-dashed border-gray-100 rounded-3xl flex flex-col items-center justify-center gap-3 hover:border-blue-600 hover:bg-blue-50/50 transition-all group bg-gray-50/50">
                                        <Library className="w-10 h-10 text-gray-300 group-hover:text-blue-600 transition-all" />
                                        <p className="text-xs font-black text-gray-400 group-hover:text-blue-700 tracking-widest">BIBLIOTECA</p>
                                    </button>
                                    <button onClick={() => fileInputRef.current?.click()} className="aspect-video border-2 border-dashed border-gray-100 rounded-3xl flex flex-col items-center justify-center gap-3 hover:border-blue-600 hover:bg-blue-50/50 transition-all group bg-gray-50/50">
                                        <Upload className="w-10 h-10 text-gray-300 group-hover:text-blue-600 transition-all" />
                                        <p className="text-xs font-black text-gray-400 group-hover:text-blue-700 tracking-widest">SUBIR FOTO</p>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />

                    {/* Nueva Configuración Avanzada */}
                    <div className="grid grid-cols-1 gap-4">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 block">Tipo de Publicación (IA Preset)</label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                {[
                                    { id: 'standard', label: 'Estándar' },
                                    { id: 'storytelling', label: 'Storytelling' },
                                    { id: 'fundraising', label: 'Fundraising' },
                                    { id: 'event', label: 'Evento' },
                                    { id: 'project', label: 'Proyecto' },
                                    { id: 'membership', label: 'Membresía' }
                                ].map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => setAiConfig({ ...aiConfig, type: type.id })}
                                        className={`px-3 py-3 rounded-xl text-[10px] font-black transition-all border-2 ${
                                            aiConfig.type === type.id 
                                            ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200' 
                                            : 'bg-white border-gray-50 text-gray-400 hover:border-blue-100'
                                        }`}
                                    >
                                        {type.label.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 block">Enfoque Rotary</label>
                            <select
                                value={aiConfig.interestArea}
                                onChange={(e) => setAiConfig({ ...aiConfig, interestArea: e.target.value })}
                                className="w-full p-4 rounded-xl border-2 border-gray-50 text-sm bg-gray-50 font-bold outline-none focus:border-blue-600 transition-colors"
                            >
                                <option value="general">Impacto General</option>
                                <option value="peace">Paz y Resolución</option>
                                <option value="disease">Prevención Enfermedades</option>
                                <option value="water">Agua y Saneamiento</option>
                                <option value="environment">Medio Ambiente</option>
                            </select>
                        </div>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={!selectedImage || isGenerating}
                        className={`w-full py-6 rounded-3xl font-black text-white shadow-2xl transition-all flex items-center justify-center gap-4 text-xl border-b-8 ${
                            !selectedImage || isGenerating 
                            ? 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed shadow-none' 
                            : 'bg-blue-600 border-blue-900 hover:bg-blue-700 hover:-translate-y-1 active:translate-y-1 active:border-b-0 shadow-blue-500/30'
                        }`}
                    >
                        {isGenerating ? (
                            <>
                                <RefreshCw className="w-7 h-7 animate-spin" />
                                OPTIMIZANDO...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-7 h-7" />
                                GENERAR CONTENIDO (4K)
                            </>
                        )}
                    </button>
                </div>

                {/* 2. Vista Previa Profesional */}
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col min-h-[750px] overflow-hidden">
                    <div className="p-6 border-b border-gray-50 flex flex-col sm:flex-row items-center justify-between bg-gray-50/50 gap-4">
                        <h3 className="font-black text-gray-900 flex items-center gap-2 tracking-tight">
                            <Eye className="w-5 h-5 text-blue-600" />
                            CONTENIDO PROFESIONAL
                        </h3>
                        <div className="flex bg-gray-200/50 p-1 rounded-2xl w-full sm:w-auto">
                            {(['facebook', 'instagram', 'x', 'linkedin'] as const).map((platform) => (
                                <button
                                    key={platform}
                                    onClick={() => setActivePlatform(platform)}
                                    className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-[9px] font-black transition-all ${
                                        activePlatform === platform 
                                        ? 'bg-white text-blue-600 shadow-xl scale-105' 
                                        : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    {platform.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 p-6 flex flex-col gap-6 bg-gray-50/30">
                        {!generatedContent ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 border-4 border-dashed border-gray-100 rounded-[3rem] bg-white">
                                <Zap className="w-20 h-20 text-gray-100 mb-8" />
                                <h4 className="text-2xl font-black text-gray-300 uppercase tracking-tighter">Motor AI en Espera</h4>
                                <p className="text-sm text-gray-400 max-w-[280px] mt-4 font-bold">
                                    Carga una imagen y elige el tipo de post para empezar a crear magia.
                                </p>
                            </div>
                        ) : (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700 flex flex-col gap-6 h-full">
                                {/* Preview Container */}
                                <div className={`relative group mx-auto bg-black rounded-3xl overflow-hidden shadow-2xl border-[8px] border-white transition-all duration-500 ${activePlatform === 'x' ? 'max-w-full aspect-video' : 'max-w-[340px] aspect-[9/16]'}`}>
                                    <img src={generatedImageUrl || ''} alt="AI Created" className="w-full h-full object-cover" />
                                    
                                    <div className="absolute top-4 right-4 flex gap-2">
                                        <button 
                                            onClick={downloadImage}
                                            className="bg-white/90 backdrop-blur-md text-gray-900 p-3 rounded-2xl shadow-2xl hover:scale-110 active:scale-95 transition-all"
                                            title="Descargar imagen"
                                        >
                                            <Download className="w-5 h-5" />
                                        </button>
                                    </div>
                                    
                                    <div className="absolute bottom-4 left-4">
                                        <span className="bg-blue-600/90 backdrop-blur-md text-white text-[10px] font-black px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2">
                                            <BarChart3 className="w-4 h-4" />
                                            {activePlatform.toUpperCase()} OPTIMIZED
                                        </span>
                                    </div>
                                </div>

                                {/* Text Area */}
                                <div className="space-y-4 flex-1">
                                    <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-xl relative min-h-[150px] flex flex-col justify-between">
                                        <div className="flex items-center gap-2 mb-4">
                                            <MessageSquare className="w-4 h-4 text-blue-600" />
                                            <span className="text-[10px] font-black text-gray-400 tracking-widest uppercase">Propuesta de Copy</span>
                                        </div>
                                        
                                        <p className="text-sm text-gray-700 leading-relaxed font-bold italic mb-6">
                                            {generatedContent[activePlatform].copy}
                                        </p>
                                        
                                        <div className="flex items-center justify-between border-t border-gray-50 pt-4">
                                            <div className="flex flex-wrap gap-2">
                                                {generatedContent[activePlatform].hashtags?.split(' ').map((tag, i) => (
                                                    <span key={i} className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                            <span className="text-[10px] font-black text-gray-300">
                                                {generatedContent[activePlatform].copy.length} CH.
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex gap-4">
                                        <button className="flex-1 bg-blue-600 text-white py-5 rounded-3xl font-black text-sm shadow-xl hover:bg-blue-700 flex items-center justify-center gap-3 transition-all transform hover:-translate-y-1">
                                            <Send className="w-5 h-5" />
                                            PROGRAMAR AHORA
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <MediaPicker
                isOpen={isMediaPickerOpen}
                onSelect={(images) => {
                    if (images && images.length > 0) {
                        setSelectedImage({ id: images[0].id, url: images[0].url, name: images[0].filename });
                        setGeneratedContent(null);
                    }
                    setIsMediaPickerOpen(false);
                }}
                onClose={() => setIsMediaPickerOpen(false)}
            />
        </div>
    );
};

export default PostGenerator;
