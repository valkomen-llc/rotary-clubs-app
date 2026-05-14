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
    Library
} from 'lucide-react';
import MediaPicker from './MediaPicker';
import { toast } from 'sonner';

interface AIConfig {
    format: string;
    interestArea: string;
}

interface PostContent {
    copy: string;
    hashtags: string;
    cta: string;
}

interface GeneratedData {
    facebook: PostContent;
    instagram: PostContent;
    x: PostContent;
}

const PostGenerator: React.FC = () => {
    const [selectedImage, setSelectedImage] = useState<any>(null);
    const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiConfig, setAiConfig] = useState<AIConfig>({
        format: 'fb_portrait',
        interestArea: 'general'
    });
    const [activePlatform, setActivePlatform] = useState<'facebook' | 'instagram' | 'x'>('facebook');
    const [generatedContent, setGeneratedContent] = useState<GeneratedData | null>(null);
    const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleGenerate = async () => {
        console.log('--- HANDLE GENERATE CLICKED ---');
        if (!selectedImage) {
            toast.error('Por favor selecciona una imagen primero');
            return;
        }

        setIsGenerating(true);
        const toastId = toast.loading('IA Generando Publicación (20-40 seg)...');

        try {
            console.log('Sending request to backend...');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/content-studio/generate-post`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('rotary_token')}`
                },
                body: JSON.stringify({
                    imageId: selectedImage.id || 'uploaded',
                    imageUrl: selectedImage.url,
                    config: aiConfig
                })
            });

            console.log('Response status:', response.status);
            const data = await response.json();
            console.log('Data received:', data);

            if (response.ok && data.success) {
                setGeneratedContent(data.content);
                setGeneratedImageUrl(data.generatedImageUrl);
                toast.success('¡Publicación generada con éxito!', { id: toastId });
            } else {
                toast.error(data.error || 'Error al generar el contenido', { id: toastId });
            }
        } catch (error: any) {
            console.error('Fetch Error:', error);
            toast.error('Error de conexión con el servidor', { id: toastId });
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
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('rotary_token')}`
                },
                body: formData
            });

            const data = await response.json();
            if (response.ok) {
                setSelectedImage({
                    id: data.id,
                    url: data.url,
                    name: file.name
                });
                setGeneratedContent(null);
                toast.success('Imagen subida con éxito', { id: toastId });
            } else {
                throw new Error(data.error || 'Error al subir');
            }
        } catch (error: any) {
            toast.error('Error al subir: ' + error.message, { id: toastId });
        }
    };

    return (
        <div className="space-y-6 pb-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 1. Selección y Configuración */}
                <div className="space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                                <ImageIcon className="w-5 h-5 text-blue-600" />
                                Selección de Imagen
                            </h3>
                            <div className="flex gap-2">
                                <button onClick={() => setIsMediaPickerOpen(true)} className="text-xs font-bold text-blue-600 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors flex items-center gap-1.5">
                                    <Library className="w-3.5 h-3.5" /> Biblioteca
                                </button>
                                <button onClick={() => fileInputRef.current?.click()} className="text-xs font-bold text-blue-600 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors flex items-center gap-1.5">
                                    <Upload className="w-3.5 h-3.5" /> Subir
                                </button>
                            </div>
                        </div>

                        <div className="p-6">
                            {selectedImage ? (
                                <div className="space-y-4">
                                    <div className="relative group rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                                        <img src={selectedImage.url} alt="Selected" className="w-full h-auto max-h-[400px] object-cover" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <button onClick={() => setIsMediaPickerOpen(true)} className="bg-white text-gray-900 px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-2 shadow-xl hover:scale-105 transition-transform">
                                                <RefreshCw className="w-4 h-4" /> Cambiar Imagen
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-center text-xs text-gray-400 font-medium truncate px-4">{selectedImage.name || 'Imagen seleccionada'}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <button onClick={() => setIsMediaPickerOpen(true)} className="aspect-video border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-blue-600 hover:bg-blue-50/50 transition-all group bg-gray-50/50">
                                        <Library className="w-8 h-8 text-gray-300 group-hover:text-blue-600 transition-colors" />
                                        <p className="text-sm font-bold text-gray-500 group-hover:text-blue-700">Biblioteca</p>
                                    </button>
                                    <button onClick={() => fileInputRef.current?.click()} className="aspect-video border-2 border-dashed border-gray-100 rounded-2xl flex flex-col items-center justify-center gap-3 hover:border-blue-600 hover:bg-blue-50/50 transition-all group bg-gray-50/50">
                                        <Upload className="w-8 h-8 text-gray-300 group-hover:text-blue-600 transition-colors" />
                                        <p className="text-sm font-bold text-gray-500 group-hover:text-blue-700">Subir Imagen</p>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />

                    {/* Configuración */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Formato de Salida</label>
                            <select
                                value={aiConfig.format}
                                onChange={(e) => setAiConfig({ ...aiConfig, format: e.target.value })}
                                className="w-full p-3 rounded-xl border border-gray-100 text-sm bg-gray-50 font-bold outline-none focus:ring-2 focus:ring-blue-500/10"
                            >
                                <option value="fb_portrait">Facebook Portrait (4:5)</option>
                                <option value="ig_reel">Instagram / TikTok (9:16)</option>
                                <option value="x_landscape">X Landscape (16:9)</option>
                            </select>
                        </div>

                        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Enfoque Rotary</label>
                            <select
                                value={aiConfig.interestArea}
                                onChange={(e) => setAiConfig({ ...aiConfig, interestArea: e.target.value })}
                                className="w-full p-3 rounded-xl border border-gray-100 text-sm bg-gray-50 font-bold outline-none focus:ring-2 focus:ring-purple-500/10"
                            >
                                <option value="general">Impacto General</option>
                                <option value="peace">Paz y Resolución</option>
                                <option value="disease">Prevención Enfermedades</option>
                                <option value="water">Agua y Saneamiento</option>
                                <option value="maternal">Salud Materna</option>
                                <option value="education">Educación Básica</option>
                                <option value="economy">Desarrollo Económico</option>
                                <option value="environment">Medio Ambiente</option>
                            </select>
                        </div>
                    </div>

                    {/* Botón Principal de Acción */}
                    <div className="relative pt-2">
                        <button
                            onClick={() => {
                                console.log('Button clicked!');
                                handleGenerate();
                            }}
                            disabled={!selectedImage || isGenerating}
                            className={`w-full py-5 rounded-2xl font-black text-white shadow-2xl transition-all flex items-center justify-center gap-3 text-lg border-b-4 ${
                                !selectedImage || isGenerating 
                                ? 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed shadow-none translate-y-1' 
                                : 'bg-blue-600 border-blue-800 hover:bg-blue-700 hover:-translate-y-0.5 active:translate-y-0.5 active:border-b-0 shadow-blue-500/20'
                            }`}
                        >
                            {isGenerating ? (
                                <>
                                    <RefreshCw className="w-6 h-6 animate-spin" />
                                    PROCESANDO CON IA...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-6 h-6" />
                                    GENERAR CON IA (4K PORTRAIT)
                                </>
                            )}
                        </button>
                        {!selectedImage && (
                            <p className="text-center text-[10px] font-black text-blue-600 mt-3 animate-pulse uppercase tracking-tighter">
                                * Por favor selecciona una imagen para habilitar la IA
                            </p>
                        )}
                    </div>
                </div>

                {/* 2. Vista Previa */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col min-h-[650px] overflow-hidden">
                    <div className="p-5 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <Send className="w-5 h-5 text-orange-500" />
                            Vista Previa
                        </h3>
                        <div className="flex bg-gray-200/50 p-1 rounded-xl">
                            {(['facebook', 'instagram', 'x'] as const).map((platform) => (
                                <button
                                    key={platform}
                                    onClick={() => setActivePlatform(platform)}
                                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                                        activePlatform === platform 
                                        ? 'bg-white text-blue-600 shadow-sm' 
                                        : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    {platform.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 p-8 flex flex-col gap-8 bg-gray-50/20">
                        {!generatedContent ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 border-4 border-dashed border-gray-100 rounded-3xl bg-white">
                                <Sparkles className="w-16 h-16 text-gray-100 mb-6" />
                                <h4 className="text-xl font-black text-gray-300 uppercase">Listo para Generar</h4>
                                <p className="text-sm text-gray-400 max-w-[220px] mt-2 font-medium">
                                    La IA transformará tu imagen a formato vertical de alta resolución.
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="relative group flex justify-center bg-black rounded-3xl overflow-hidden shadow-2xl border-[6px] border-white mx-auto w-full max-w-[320px]">
                                    <div className="aspect-[4/5] w-full relative">
                                        <img src={generatedImageUrl || ''} alt="AI Optimized" className="w-full h-full object-cover" />
                                        <div className="absolute top-4 left-4">
                                            <span className="bg-blue-600 text-white text-[10px] font-black px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1">
                                                <Sparkles className="w-3 h-3" />
                                                IA OPTIMIZADA
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm relative">
                                        <p className="text-sm text-gray-700 leading-relaxed font-medium italic">
                                            "{generatedContent[activePlatform].copy}"
                                        </p>
                                        <p className="mt-4 text-sm font-black text-blue-600">
                                            {generatedContent[activePlatform].hashtags}
                                        </p>
                                    </div>

                                    <button className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg shadow-lg hover:bg-blue-700 flex items-center justify-center gap-3 transition-all">
                                        <Send className="w-5 h-5" />
                                        PROGRAMAR PUBLICACIÓN
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <MediaPicker
                isOpen={isMediaPickerOpen}
                onSelect={(images) => {
                    if (images && images.length > 0) {
                        setSelectedImage({
                            id: images[0].id,
                            url: images[0].url,
                            name: images[0].filename
                        });
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
