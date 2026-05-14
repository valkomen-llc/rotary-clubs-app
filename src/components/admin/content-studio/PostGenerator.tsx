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
import { toast } from 'react-hot-toast';

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
        if (!selectedImage) {
            toast.error('Por favor selecciona una imagen primero');
            return;
        }

        setIsGenerating(true);
        const toastId = toast.loading('IA Generando Publicación (esto puede tardar 20-40 seg)...');

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 min timeout client-side

            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/content-studio/generate-post`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    imageId: selectedImage.id || 'uploaded',
                    imageUrl: selectedImage.url,
                    config: aiConfig
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            const data = await response.json();

            if (response.ok && data.success) {
                setGeneratedContent(data.content);
                setGeneratedImageUrl(data.generatedImageUrl);
                toast.success('¡Publicación generada con éxito!', { id: toastId });
            } else {
                toast.error(data.error || 'Error al generar el contenido', { id: toastId });
            }
        } catch (error: any) {
            console.error('Fetch Error:', error);
            if (error.name === 'AbortError') {
                toast.error('La IA tardó demasiado. Intenta de nuevo.', { id: toastId });
            } else {
                toast.error('Error de conexión o servidor saturado', { id: toastId });
            }
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
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
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
        <div className="space-y-6 pb-20">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 1. Selección y Configuración */}
                <div className="space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                                <ImageIcon className="w-5 h-5 text-blue-600" />
                                Selección de Imagen
                            </h3>
                            <div className="flex gap-4">
                                <button onClick={() => setIsMediaPickerOpen(true)} className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 bg-blue-50 px-2 py-1 rounded">
                                    <Library className="w-3 h-3" /> Biblioteca
                                </button>
                                <button onClick={() => fileInputRef.current?.click()} className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 bg-blue-50 px-2 py-1 rounded">
                                    <Upload className="w-3 h-3" /> Subir
                                </button>
                            </div>
                        </div>

                        <div className="p-6">
                            {selectedImage ? (
                                <div className="space-y-4">
                                    <div className="relative group rounded-lg overflow-hidden border border-gray-200 shadow-sm">
                                        <img src={selectedImage.url} alt="Selected" className="w-full h-auto max-h-[400px] object-cover" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                            <button onClick={() => setIsMediaPickerOpen(true)} className="bg-white text-gray-900 px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-2 shadow-lg">
                                                <Library className="w-4 h-4" /> Cambiar
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-center text-gray-500 font-medium">{selectedImage.name || 'Imagen seleccionada'}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => setIsMediaPickerOpen(true)}
                                        className="aspect-video border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-blue-600 hover:bg-blue-50 transition-all group"
                                    >
                                        <Library className="w-6 h-6 text-gray-400 group-hover:text-blue-600" />
                                        <p className="text-sm font-bold text-gray-700">Biblioteca</p>
                                    </button>

                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="aspect-video border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-blue-600 hover:bg-blue-50 transition-all group"
                                    >
                                        <Upload className="w-6 h-6 text-gray-400 group-hover:text-blue-600" />
                                        <p className="text-sm font-bold text-gray-700">Subir</p>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />

                    {/* Configuración */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
                                <Layout className="w-4 h-4 text-blue-600" /> Formato de Salida
                            </h3>
                            <select
                                value={aiConfig.format}
                                onChange={(e) => setAiConfig({ ...aiConfig, format: e.target.value })}
                                className="w-full p-3 rounded-lg border border-gray-200 text-sm bg-gray-50 font-medium outline-none focus:ring-2 focus:ring-blue-500/20"
                            >
                                <option value="fb_portrait">Facebook Portrait (4:5)</option>
                                <option value="ig_reel">Instagram / TikTok (9:16)</option>
                                <option value="x_landscape">X Landscape (16:9)</option>
                            </select>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="font-bold text-gray-800 text-sm mb-4 flex items-center gap-2">
                                <Zap className="w-4 h-4 text-purple-600" /> Enfoque Rotary
                            </h3>
                            <select
                                value={aiConfig.interestArea}
                                onChange={(e) => setAiConfig({ ...aiConfig, interestArea: e.target.value })}
                                className="w-full p-3 rounded-lg border border-gray-200 text-sm bg-gray-50 font-medium outline-none focus:ring-2 focus:ring-purple-500/20"
                            >
                                <option value="general">Impacto General</option>
                                <option value="peace">Paz y resolución de conflictos</option>
                                <option value="disease">Prevención de enfermedades</option>
                                <option value="water">Agua y saneamiento</option>
                                <option value="maternal">Salud materno-infantil</option>
                                <option value="education">Educación básica y alfabetización</option>
                                <option value="economy">Desarrollo económico integral</option>
                                <option value="environment">Apoyo al medio ambiente</option>
                            </select>
                        </div>
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={!selectedImage || isGenerating}
                        className={`w-full py-5 rounded-2xl font-black text-white shadow-xl transition-all flex items-center justify-center gap-3 text-lg ${
                            !selectedImage || isGenerating 
                            ? 'bg-gray-300 cursor-not-allowed text-gray-500' 
                            : 'bg-blue-600 hover:bg-blue-700 hover:scale-[1.01] active:scale-[0.99] border-b-4 border-blue-800 shadow-blue-500/20'
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
                    {!selectedImage && !isGenerating && (
                        <p className="text-center text-xs font-bold text-blue-600 animate-pulse">
                            * Selecciona una imagen para habilitar el generador
                        </p>
                    )}
                </div>

                {/* 2. Vista Previa */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col min-h-[650px] overflow-hidden">
                    <div className="p-5 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <Send className="w-5 h-5 text-orange-500" />
                            Vista Previa de Publicación
                        </h3>
                        <div className="flex bg-gray-200/50 p-1 rounded-xl">
                            {(['facebook', 'instagram', 'x'] as const).map((platform) => (
                                <button
                                    key={platform}
                                    onClick={() => setActivePlatform(platform)}
                                    className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${
                                        activePlatform === platform 
                                        ? 'bg-white text-blue-600 shadow-sm' 
                                        : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                >
                                    {platform === 'x' ? 'X' : platform.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 p-8 flex flex-col gap-8 bg-gray-50/30">
                        {!generatedContent ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 border-4 border-dashed border-gray-100 rounded-3xl bg-white">
                                <Sparkles className="w-16 h-16 text-gray-100 mb-6" />
                                <h4 className="text-xl font-black text-gray-300">LISTO PARA GENERAR</h4>
                                <p className="text-sm text-gray-400 max-w-[200px] mt-2 font-medium">
                                    Haz clic en el botón azul para iniciar la transformación 4K.
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
                                        <p className="text-sm text-gray-700 leading-relaxed font-medium">
                                            {generatedContent[activePlatform].copy}
                                        </p>
                                        <p className="mt-4 text-sm font-black text-blue-600">
                                            {generatedContent[activePlatform].hashtags}
                                        </p>
                                        <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Call to Action</span>
                                            <span className="text-sm font-bold text-gray-900">{generatedContent[activePlatform].cta}</span>
                                        </div>
                                    </div>

                                    <button className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black text-lg shadow-lg hover:bg-blue-700 flex items-center justify-center gap-3 transition-all">
                                        <Send className="w-5 h-5" />
                                        PROGRAMAR AHORA
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
