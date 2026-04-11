import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useClub } from '../../../contexts/ClubContext';
import { FileText, Plus, Trash2, Edit2, Loader2, Building2, Upload, Eye, EyeOff, Calendar, FileCheck, FileSpreadsheet, Monitor, FileCode, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

const DownloadsAdmin: React.FC = () => {
    const { token, user } = useAuth();
    const { club } = useClub();
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('all');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingDoc, setEditingDoc] = useState<any>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/documents`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setDocuments(await res.json());
        } catch (error) {
            console.error('Error fetching documents:', error);
            toast.error('Error al cargar documentos');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`¿Seguro que deseas eliminar permanentemente el archivo "${name}"?`)) return;
        try {
            const res = await fetch(`${API}/documents/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success('Archivo eliminado con éxito');
                fetchData();
            } else {
                toast.error('No se pudo eliminar el archivo');
            }
        } catch (error) {
            toast.error('Error al eliminar');
        }
    };

    const getCategoryBadge = (category: string) => {
        switch (category) {
            case 'pdf': return <span className="px-2.5 py-1 bg-red-100 text-red-800 text-xs font-bold rounded-lg flex items-center gap-1 w-fit"><FileText className="w-3 h-3"/> PDF</span>;
            case 'word': return <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-lg flex items-center gap-1 w-fit"><FileCheck className="w-3 h-3"/> Word</span>;
            case 'excel': return <span className="px-2.5 py-1 bg-green-100 text-green-800 text-xs font-bold rounded-lg flex items-center gap-1 w-fit"><FileSpreadsheet className="w-3 h-3"/> Excel</span>;
            case 'presentation': return <span className="px-2.5 py-1 bg-orange-100 text-orange-800 text-xs font-bold rounded-lg flex items-center gap-1 w-fit"><Monitor className="w-3 h-3"/> Presentación</span>;
            default: return <span className="px-2.5 py-1 bg-gray-100 text-gray-800 text-xs font-bold rounded-lg flex items-center gap-1 w-fit"><FileCode className="w-3 h-3"/> Otros / Varios</span>;
        }
    };

    const filteredDocs = documents.filter(doc => {
        const matchesSearch = doc.fileName.toLowerCase().includes(searchTerm.toLowerCase()) || doc.category?.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = filterCategory === 'all' || doc.category === filterCategory;
        return matchesSearch && matchesCategory;
    });

    if (loading) {
        return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-slate-800" /></div>;
    }

    return (
        <div className="max-w-6xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg bg-gradient-to-br from-indigo-700 to-indigo-900 border border-indigo-600">
                        <Upload className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Centro de Descargas</h1>
                        <p className="text-gray-500 font-medium mt-1">Gestiona los archivos y recursos públicos de tu comunidad</p>
                    </div>
                </div>
                <button
                    onClick={() => { setEditingDoc(null); setIsModalOpen(true); }}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-md active:scale-95"
                >
                    <Plus className="w-5 h-5" /> Subir Recurso
                </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 mb-6 flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Buscar por nombre o descripción..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm"
                    />
                </div>
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select 
                        value={filterCategory}
                        onChange={e => setFilterCategory(e.target.value)}
                        className="flex-1 md:w-48 py-2 px-3 border border-gray-100 rounded-xl bg-gray-50 focus:bg-white outline-none text-sm font-medium"
                    >
                        <option value="all">Todas las categorías</option>
                        <option value="pdf">Documentos PDF</option>
                        <option value="word">Archivos Word</option>
                        <option value="excel">Hojas Excel</option>
                        <option value="presentation">Presentaciones</option>
                        <option value="otros">Otros formatos</option>
                    </select>
                </div>
            </div>

            {/* Content */}
            {filteredDocs.length > 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-gray-200 text-xs uppercase font-bold text-slate-500">
                            <tr>
                                <th className="px-6 py-4">Archivo / Recurso</th>
                                <th className="px-6 py-4">Categoría</th>
                                <th className="px-6 py-4">Tamaño</th>
                                <th className="px-6 py-4">Fecha</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredDocs.map((doc: any) => {
                                const Icon = iconosTipo[doc.category] || FileText;
                                return (
                                    <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-4">
                                            <a href={doc.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 group">
                                                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                                                    <Icon className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{doc.fileName}</p>
                                                    <p className="text-[10px] text-gray-400 font-mono truncate max-w-[200px]">{doc.fileUrl}</p>
                                                </div>
                                            </a>
                                        </td>
                                        <td className="px-6 py-4">
                                            {getCategoryBadge(doc.category)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-xs font-bold text-slate-500">{(doc.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-xs text-gray-500">{new Date(doc.createdAt).toLocaleDateString()}</p>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button onClick={() => handleDelete(doc.id, doc.fileName)} className="p-2 text-gray-300 hover:text-red-600 transition-colors" title="Eliminar"><Trash2 className="w-4 h-4" /></button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="bg-white rounded-3xl border-2 border-dashed border-gray-100 p-20 text-center">
                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                        <FileText className="w-10 h-10 text-gray-200" />
                    </div>
                    <h3 className="text-xl font-black text-gray-900 mb-2">No hay archivos en {filterCategory === 'all' ? 'el repositorio' : 'esta categoría'}</h3>
                    <p className="text-gray-500 text-sm max-w-sm mx-auto mb-8">
                        Comienza a subir documentos, manuales o presentaciones para que tu comunidad pueda descargarlos fácilmente.
                    </p>
                    <button onClick={() => { setEditingDoc(null); setIsModalOpen(true); }} className="inline-flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white font-black rounded-2xl hover:bg-indigo-700 transition-all shadow-lg active:scale-95">
                        <Plus className="w-5 h-5" /> Subir primer archivo
                    </button>
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl animate-scale-up relative">
                        <button onClick={() => setIsModalOpen(false)} className="absolute right-6 top-6 p-2 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-full transition-all">
                            <Plus className="w-6 h-6 rotate-45" />
                        </button>

                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                                <Upload className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-slate-800">Cargar Recurso</h2>
                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">Centro de Descargas</p>
                            </div>
                        </div>
                        
                        <UploadForm 
                            onClose={() => setIsModalOpen(false)} 
                            onSave={() => { setIsModalOpen(false); fetchData(); }} 
                            token={token}
                            clubId={user?.clubId || club?.id}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

const iconosTipo: any = {
    pdf: FileText,
    word: FileCheck,
    excel: FileSpreadsheet,
    presentation: Monitor,
    otros: FileCode
};

const UploadForm = ({ onClose, onSave, token, clubId }: any) => {
    const [file, setFile] = useState<File | null>(null);
    const [category, setCategory] = useState('pdf');
    const [uploading, setUploading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            toast.error('Selecciona un archivo para subir');
            return;
        }

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('category', category);
            formData.append('clubId', clubId);

            const res = await fetch(`${API}/documents/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });

            if (res.ok) {
                toast.success('¡Archivo subido con éxito!');
                onSave();
            } else {
                const data = await res.json();
                toast.error(data.error || 'Error al subir el archivo');
            }
        } catch (error) {
            toast.error('Error de red al intentar subir');
        } finally {
            setUploading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
                <div>
                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.15em] mb-2 block ml-1">Tipo de Recurso</label>
                    <div className="grid grid-cols-2 gap-2">
                        {['pdf', 'word', 'excel', 'presentation', 'otros'].map(cat => (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setCategory(cat)}
                                className={`px-4 py-3 rounded-2xl text-xs font-bold border transition-all flex items-center gap-2 ${category === cat ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-gray-50 border-gray-100 text-gray-400 hover:border-indigo-200 hover:text-indigo-400'}`}
                            >
                                {React.createElement(iconosTipo[cat] || FileCode, { className: "w-4 h-4" })}
                                {cat.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.15em] mb-2 block ml-1">Seleccionar Archivo</label>
                    <div className="relative group">
                        <input 
                            type="file" 
                            onChange={e => setFile(e.target.files?.[0] || null)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                            disabled={uploading}
                        />
                        <div className={`p-8 border-2 border-dashed rounded-3xl text-center transition-all ${file ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-slate-200 group-hover:border-indigo-300 group-hover:bg-indigo-50/30'}`}>
                            {file ? (
                                <div className="flex flex-col items-center">
                                    <FileCheck className="w-10 h-10 text-emerald-500 mb-2" />
                                    <p className="text-sm font-black text-emerald-800 truncate w-full px-4">{file.name}</p>
                                    <p className="text-[10px] text-emerald-500 font-bold">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <div className="w-10 h-10 bg-white rounded-xl shadow-sm border border-slate-100 flex items-center justify-center mb-3">
                                        <Plus className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <p className="text-sm font-bold text-slate-500">Documentos, Manuales, Excel...</p>
                                    <p className="text-[10px] text-slate-400 font-medium mt-1 uppercase tracking-widest">Arrastra o haz clic aquí</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex gap-3 pt-2">
                <button 
                    type="button" 
                    onClick={onClose}
                    className="flex-1 py-4 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
                >
                    Cancelar
                </button>
                <button 
                    type="submit" 
                    disabled={!file || uploading}
                    className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 disabled:opacity-50 disabled:grayscale transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2"
                >
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploading ? 'SUBIENDO...' : 'PUBLICA AHORA'}
                </button>
            </div>
        </form>
    );
};

export default DownloadsAdmin;
