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
        const toastId = toast.loading('Generando publicación con IA...');

        try {
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
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                setGeneratedContent(data.content);
                setGeneratedImageUrl(data.generatedImageUrl);
                toast.success('¡Publicación generada con éxito!', { id: toastId });
            } else {
                toast.error(data.error || 'Error al generar el contenido', { id: toastId });
            }
        } catch (error) {
            console.error('Fetch Error:', error);
            toast.error('Error de conexión al servidor', { id: toastId });
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
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* 1. Selección y Configuración */}
                <div className="space-y-6">
                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                        <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                            <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                                <ImageIcon className="w-5 h-5 text-rotary-blue" />
                                Selección de Imagen
                            </h3>
                            {selectedImage && (
                                <div className="flex gap-3">
                                    <button onClick={() => setIsMediaPickerOpen(true)} className="text-xs text-rotary-blue hover:underline font-medium flex items-center gap-1">
                                        <Library className="w-3 h-3" /> Biblioteca
                                    </button>
                                    <button onClick={() => fileInputRef.current?.click()} className="text-xs text-rotary-blue hover:underline font-medium flex items-center gap-1">
                                        <Upload className="w-3 h-3" /> Subir
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="p-6">
                            {selectedImage ? (
                                <div className="space-y-4">
                                    <div className="relative group rounded-lg overflow-hidden border border-gray-200">
                                        <img src={selectedImage.url} alt="Selected" className="w-full h-auto max-h-[300px] object-cover" />
                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                            <button onClick={() => setIsMediaPickerOpen(true)} className="bg-white text-gray-900 px-3 py-2 rounded-lg font-medium text-xs flex items-center gap-2">
                                                <Library className="w-4 h-4" /> Biblioteca
                                            </button>
                                            <button onClick={() => fileInputRef.current?.click()} className="bg-white text-gray-900 px-3 py-2 rounded-lg font-medium text-xs flex items-center gap-2">
                                                <Upload className="w-4 h-4" /> Subir Nuevo
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-center text-gray-500 italic">{selectedImage.name || 'Imagen seleccionada'}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => setIsMediaPickerOpen(true)}
                                        className="aspect-video border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-rotary-blue hover:bg-blue-50 transition-all group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-blue-100">
                                            <Library className="w-5 h-5 text-gray-400 group-hover:text-rotary-blue" />
                                        </div>
                                        <p className="text-sm font-medium text-gray-700">Biblioteca</p>
                                    </button>

                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="aspect-video border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center gap-2 hover:border-rotary-blue hover:bg-blue-50 transition-all group"
                                    >
                                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center group-hover:bg-blue-100">
                                            <Upload className="w-5 h-5 text-gray-400 group-hover:text-rotary-blue" />
                                        </div>
                                        <p className="text-sm font-medium text-gray-700">Subir Imagen</p>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" />

                    {/* Configuración */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="p-2 bg-blue-50 rounded-lg"><Layout className="w-5 h-5 text-rotary-blue" /></div>
                                <h3 className="font-semibold text-gray-800">Conversión Pro (IA)</h3>
                            </div>
                            <select
                                value={aiConfig.format}
                                onChange={(e) => setAiConfig({ ...aiConfig, format: e.target.value })}
                                className="w-full p-2.5 rounded-lg border border-gray-200 text-sm outline-none"
                            >
                                <option value="fb_portrait">Facebook Portrait (4:5)</option>
                                <option value="ig_reel">Instagram / TikTok (9:16)</option>
                                <option value="x_landscape">X Landscape (16:9)</option>
                            </select>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex items-center gap-2 mb-4">
                                <div className="p-2 bg-purple-50 rounded-lg"><Zap className="w-5 h-5 text-purple-600" /></div>
                                <h3 className="font-semibold text-gray-800">Enfoque Rotary</h3>
                            </div>
                            <select
                                value={aiConfig.interestArea}
                                onChange={(e) => setAiConfig({ ...aiConfig, interestArea: e.target.value })}
                                className="w-full p-2.5 rounded-lg border border-gray-200 text-sm outline-none"
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
                        className={`w-full py-4 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-3 ${
                            !selectedImage || isGenerating ? 'bg-gray-400 cursor-not-allowed' : 'bg-gradient-to-r from-rotary-blue to-blue-700 hover:scale-[1.02]'
                        }`}
                    >
                        {isGenerating ? <><RefreshCw className="w-5 h-5 animate-spin" /> PROCESANDO...</> : <><Sparkles className="w-5 h-5" /> GENERAR CON IA (4K)</>}
                    </button>
                </div>

                {/* 2. Vista Previa */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col min-h-[600px]">
                    <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                        <h3 className="font-semibold text-gray-800 flex items-center gap-2"><Send className="w-5 h-5 text-rotary-gold" /> Vista Previa</h3>
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            {(['facebook', 'instagram', 'x'] as const).map((platform) => (
                                <button
                                    key={platform}
                                    onClick={() => setActivePlatform(platform)}
                                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${activePlatform === platform ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}
                                >
                                    {platform === 'x' ? 'X' : platform.charAt(0).toUpperCase() + platform.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 p-6 flex flex-col gap-6">
                        {!generatedContent ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/30">
                                <Sparkles className="w-10 h-10 text-gray-200 mb-4" />
                                <h4 className="text-lg font-semibold text-gray-400">Sin contenido</h4>
                            </div>
                        ) : (
                            <>
                                <div className="relative group flex justify-center bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border-4 border-white mx-auto w-full max-w-[320px]">
                                    <div className="aspect-[4/5] w-full relative">
                                        <img src={generatedImageUrl || ''} alt="AI Optimized" className="w-full h-full object-cover" />
                                        <div className="absolute top-4 left-4">
                                            <span className="bg-rotary-blue text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg flex items-center gap-1">
                                                <Sparkles className="w-3 h-3" /> IA OPTIMIZADA
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                        <p className="text-sm text-gray-700 leading-relaxed">{generatedContent[activePlatform].copy}</p>
                                        <p className="mt-3 text-sm font-medium text-rotary-blue">{generatedContent[activePlatform].hashtags}</p>
                                    </div>
                                    <button className="w-full bg-gray-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                                        <Send className="w-4 h-4" /> Programar
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
