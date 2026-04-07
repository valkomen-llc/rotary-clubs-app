import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    BookOpen,
    Upload,
    Trash2,
    Globe,
    Home,
    Plus,
    Loader2,
    CheckCircle2,
    X,
    Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';

interface KnowledgeSource {
    id: string;
    title: string;
    type: string;
    content: string;
    fileUrl: string | null;
    clubId: string | null;
    createdAt: string;
}

const KnowledgeBase: React.FC = () => {
    const { user } = useAuth();
    const [sources, setSources] = useState<KnowledgeSource[]>([]);
    const [loading, setLoading] = useState(true);
    const [isUploading, setIsUploading] = useState(false);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [viewingSource, setViewingSource] = useState<KnowledgeSource | null>(null);
    const [newSource, setNewSource] = useState({ title: '', content: '', isGlobal: false });

    const isSuperAdmin = user?.role === 'administrator';

    useEffect(() => {
        fetchSources();
    }, []);

    const fetchSources = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/ai/knowledge`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setSources(data);
            }
        } catch (error) {
            toast.error('Error al cargar la base de conocimiento');
        } finally {
            setLoading(false);
        }
    };

    const handleAddSource = async () => {
        if (!newSource.title || !newSource.content) return toast.error('Complete todos los campos');

        setIsUploading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/ai/knowledge`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    title: newSource.title,
                    content: newSource.content,
                    type: 'text',
                    isLocal: !newSource.isGlobal
                })
            });

            if (response.ok) {
                toast.success('Conocimiento añadido correctamente');
                setShowUploadModal(false);
                setNewSource({ title: '', content: '', isGlobal: false });
                fetchSources();
            }
        } catch (error) {
            toast.error('Error al guardar');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <BookOpen className="text-rotary-blue w-7 h-7" />
                        Base de Conocimiento IA
                    </h1>
                    <p className="text-gray-500 text-sm">Entrena al asistente con documentos institucionales y locales.</p>
                </div>
                <div className="flex items-center gap-3">
                    {isSuperAdmin && (
                        <button
                            onClick={async () => {
                                const toastId = toast.loading('Iniciando búsqueda de subvenciones...');
                                try {
                                    const token = localStorage.getItem('rotary_token');
                                    const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/agents/orchestrate`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                        body: JSON.stringify({ type: 'new_grant_found', payload: { source: 'manual_trigger' }, clubId: user?.clubId || '00000000-0000-0000-0000-000000000000' })
                                    });
                                    if (response.ok) toast.success('Automatización de Subvenciones disparada. Elena y Rafael están analizando fuentes.', { id: toastId });
                                    else toast.error('Error al disparar la orquestación.', { id: toastId });
                                } catch (e) { toast.error('Error de conexión.', { id: toastId }); }
                            }}
                            className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
                        >
                            <Sparkles className="w-5 h-5" /> Ejecutar Grant Scout
                        </button>
                    )}
                    <button
                        onClick={() => setShowUploadModal(true)}
                        className="flex items-center gap-2 bg-rotary-blue text-white px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-rotary-blue/20 hover:bg-sky-800 transition-all"
                    >
                        <Plus className="w-5 h-5" /> Añadir Información
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    Array(3).fill(0).map((_, i) => (
                        <div key={i} className="h-40 bg-gray-100 rounded-3xl animate-pulse" />
                    ))
                ) : sources.length === 0 ? (
                    <div className="col-span-full py-20 bg-white rounded-3xl border border-dashed border-gray-200 text-center">
                        <BookOpen className="w-16 h-16 text-gray-100 mx-auto mb-4" />
                        <p className="text-gray-400 font-bold">No hay documentos en la base de conocimiento</p>
                    </div>
                ) : (
                    sources.map(source => (
                        <div key={source.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                            <div className="flex justify-between items-start mb-4">
                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${source.clubId ? 'bg-sky-50 text-rotary-blue' : 'bg-purple-50 text-purple-600'}`}>
                                    {source.clubId ? <Home className="w-6 h-6" /> : <Globe className="w-6 h-6" />}
                                </div>
                                <span className={`text-[10px] font-extrabold uppercase px-2 py-1 rounded-lg ${source.clubId ? 'bg-sky-50 text-rotary-blue' : 'bg-purple-50 text-purple-600'}`}>
                                    {source.clubId ? 'Local' : 'Global (Súper Admin)'}
                                </span>
                            </div>
                            <h3 className="font-bold text-gray-800 mb-2 truncate">{source.title}</h3>
                            <button 
                                onClick={() => setViewingSource(source)}
                                className="text-left w-full group-hover:bg-gray-50 p-2 -m-2 rounded-xl transition-colors"
                            >
                                <p className="text-xs text-gray-500 line-clamp-3 mb-4">{source.content}</p>
                            </button>
                            <div className="flex justify-between items-center pt-4 border-t border-gray-50">
                                <span className="text-[10px] text-gray-400 font-bold">
                                    Añadido: {new Date(source.createdAt).toLocaleDateString()}
                                </span>
                                <button className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* AI Integration Alert */}
            <div className="mt-12 p-8 bg-gradient-to-br from-rotary-blue to-sky-700 rounded-3xl text-white relative overflow-hidden shadow-xl shadow-rotary-blue/20">
                <div className="absolute top-0 right-0 p-10 opacity-10">
                    <CheckCircle2 className="w-40 h-40" />
                </div>
                <div className="relative z-10 max-w-2xl">
                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Sparkles className="w-6 h-6" /> ¿Cómo funciona el Agente?
                    </h3>
                    <p className="text-sky-100 leading-relaxed">
                        El asistente de contenido lee automáticamente toda la información cargada arriba.
                        Si eres Súper Admin y cargas un "Manual de Marca", **todos los clubes** se beneficiarán de esas guías.
                        Si un club carga su "Historia Local", el asistente personalizará las sugerencias solo para ese club,
                        combinándolas con las guías globales.
                    </p>
                </div>
            </div>

            {/* Upload Modal */}
            {showUploadModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800">Cargar Conocimiento</h3>
                            <button onClick={() => setShowUploadModal(false)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-2">Título del Documento</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/10 font-medium"
                                    placeholder="Ej: Manual de Imagen Pública 2026"
                                    value={newSource.title}
                                    onChange={e => setNewSource({ ...newSource, title: e.target.value })}
                                />
                            </div>

                            {isSuperAdmin && (
                                <div className="flex items-center gap-2 p-3 bg-purple-50 rounded-xl border border-purple-100">
                                    <input
                                        type="checkbox"
                                        id="global"
                                        className="w-4 h-4 text-purple-600 rounded"
                                        checked={newSource.isGlobal}
                                        onChange={e => setNewSource({ ...newSource, isGlobal: e.target.checked })}
                                    />
                                    <label htmlFor="global" className="text-xs font-bold text-purple-700 cursor-pointer">
                                        ¿Hacer esta información Global para todos los clubes?
                                    </label>
                                </div>
                            )}

                            <div>
                                <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest block mb-2">Contenido o Resumen para la IA</label>
                                <textarea
                                    rows={6}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/10 font-medium text-sm"
                                    placeholder="Pega aquí el texto, reglas o información clave que la IA debe conocer..."
                                    value={newSource.content}
                                    onChange={e => setNewSource({ ...newSource, content: e.target.value })}
                                />
                            </div>

                            <button
                                onClick={handleAddSource}
                                disabled={isUploading}
                                className="w-full py-4 bg-rotary-blue text-white rounded-2xl font-bold shadow-lg shadow-rotary-blue/20 hover:bg-sky-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                                Guardar en la Base de Datos
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* View Source Modal */}
            {viewingSource && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center mb-6">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${viewingSource.clubId ? 'bg-sky-50 text-rotary-blue' : 'bg-purple-50 text-purple-600'}`}>
                                    {viewingSource.clubId ? <Home className="w-5 h-5" /> : <Globe className="w-5 h-5" />}
                                </div>
                                <h3 className="text-xl font-bold text-gray-800">{viewingSource.title}</h3>
                            </div>
                            <button onClick={() => setViewingSource(null)} className="p-2 hover:bg-gray-100 rounded-full transition-all">
                                <X className="w-5 h-5 text-gray-400" />
                            </button>
                        </div>

                        <div className="overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-gray-200">
                            <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 mb-6">
                                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap text-sm font-medium">
                                    {viewingSource.content}
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4 border-t border-gray-50 mt-auto">
                            <button 
                                onClick={() => setViewingSource(null)}
                                className="px-6 py-2.5 bg-gray-900 text-white rounded-xl font-bold text-sm hover:bg-gray-800 transition-all"
                            >
                                Cerrar Vista
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default KnowledgeBase;
