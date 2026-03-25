import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useClub } from '../../../contexts/ClubContext';
import { FileText, Plus, Trash2, Edit2, Loader2, Building2, Upload, Eye, EyeOff, Calendar, FileCheck, Landmark } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

const FinancialAdmin: React.FC = () => {
    const { token } = useAuth();
    const { club } = useClub();
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingReport, setEditingReport] = useState<any>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/financial/reports`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setReports(await res.json());
        } catch (error) {
            console.error('Error fetching financial reports:', error);
            toast.error('Error al cargar reportes financieros');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string, title: string) => {
        if (!confirm(`¿Seguro que deseas eliminar permanentemente el reporte "${title}"?`)) return;
        try {
            await fetch(`${API}/financial/reports/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            toast.success('Reporte eliminado con éxito');
            fetchData();
        } catch (error) {
            toast.error('Error al eliminar');
        }
    };

    const getCategoryBadge = (category: string) => {
        switch (category) {
            case 'dian': return <span className="px-2.5 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded-lg flex items-center gap-1 w-fit"><Landmark className="w-3 h-3"/> DIAN / Impuestos</span>;
            case 'financial': return <span className="px-2.5 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded-lg flex items-center gap-1 w-fit"><Landmark className="w-3 h-3"/> Balance Financiero</span>;
            case 'management': return <span className="px-2.5 py-1 bg-purple-100 text-purple-800 text-xs font-bold rounded-lg flex items-center gap-1 w-fit"><FileCheck className="w-3 h-3"/> Informe Gestión</span>;
            default: return <span className="px-2.5 py-1 bg-gray-100 text-gray-800 text-xs font-bold rounded-lg flex items-center gap-1 w-fit"><FileText className="w-3 h-3"/> Otro Legal</span>;
        }
    };

    // Agrupación de reportes por Año Fiscal (Year)
    const groupedReports = reports.reduce((acc: any, report: any) => {
        if (!acc[report.year]) acc[report.year] = [];
        acc[report.year].push(report);
        return acc;
    }, {});

    const sortedYears = Object.keys(groupedReports).sort((a, b) => parseInt(b) - parseInt(a));

    if (loading) {
        return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-slate-800" /></div>;
    }

    return (
        <div className="max-w-6xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg bg-gradient-to-br from-slate-700 to-slate-900 border border-slate-600">
                        <Building2 className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Transparencia y Legal</h1>
                        <p className="text-gray-500 font-medium mt-1">Estados Financieros, Balances y Reportes Gubernamentales DIAN</p>
                    </div>
                </div>
                <button
                    onClick={() => { setEditingReport(null); setIsModalOpen(true); }}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition-all shadow-md active:scale-95"
                >
                    <Upload className="w-5 h-5" /> Subir Documento PDF
                </button>
            </div>

            {/* Folder Layout per Year */}
            {sortedYears.length > 0 ? (
                <div className="space-y-6">
                    {sortedYears.map((year: string) => (
                        <div key={year} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
                            <div className="bg-slate-50 border-b border-gray-200 p-4 px-6 flex items-center gap-3">
                                <Calendar className="w-5 h-5 text-slate-500" />
                                <h2 className="text-lg font-black text-slate-800">Ejercicio Fiscal {year}</h2>
                                <span className="ml-auto text-xs font-bold text-slate-400 bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">
                                    {groupedReports[year].length} Documentos
                                </span>
                            </div>
                            <div className="p-0">
                                <table className="w-full text-left">
                                    <thead className="bg-white border-b border-gray-100 text-xs uppercase font-bold text-gray-400">
                                        <tr>
                                            <th className="px-6 py-3 w-1/2">Documento de Transparencia</th>
                                            <th className="px-6 py-3">Categoría Legal</th>
                                            <th className="px-6 py-3 text-center">Privacidad</th>
                                            <th className="px-6 py-3 text-right">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {groupedReports[year].map((r: any) => (
                                            <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    <a href={r.documentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-3 group">
                                                        <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center group-hover:bg-red-500 group-hover:text-white transition-colors">
                                                            <FileText className="w-5 h-5" />
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-900 group-hover:text-rotary-blue transition-colors">{r.title}</p>
                                                            <p className="text-xs text-gray-400 font-medium font-mono truncate max-w-xs">{r.documentUrl}</p>
                                                        </div>
                                                    </a>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {getCategoryBadge(r.category)}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {r.status === 'public' ? (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-full">
                                                            <Eye className="w-3.5 h-3.5" /> Público
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-gray-600 text-xs font-bold rounded-full">
                                                            <EyeOff className="w-3.5 h-3.5" /> Privado Club
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button onClick={() => { setEditingReport(r); setIsModalOpen(true); }} className="p-2 text-gray-400 hover:text-blue-600 transition-colors" title="Editar Metadatos"><Edit2 className="w-4 h-4" /></button>
                                                    <button onClick={() => handleDelete(r.id, r.title)} className="p-2 text-gray-400 hover:text-red-600 transition-colors" title="Eliminar Permanente"><Trash2 className="w-4 h-4" /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center shadow-sm">
                    <Building2 className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-900 mb-1">El portal de Transparencia está vacío</h3>
                    <p className="text-gray-500 text-sm max-w-sm mx-auto mb-6">
                        Sube tus primeros estados financieros anuales o los requerimientos de la DIAN para dar cumplimiento a los estándares de Rotary Org.
                    </p>
                    <button onClick={() => { setEditingReport(null); setIsModalOpen(true); }} className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition-colors">
                        <Upload className="w-4 h-4" /> Subir Primer Reporte
                    </button>
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <ReportModal 
                        report={editingReport} 
                        onClose={() => setIsModalOpen(false)} 
                        onSave={() => { setIsModalOpen(false); fetchData(); }} 
                        token={token}
                        club={club}
                    />
                </div>
            )}
        </div>
    );
};

export default FinancialAdmin;

const ReportModal = ({ report, onClose, onSave, token, club }: any) => {
    const [formData, setFormData] = useState(report || { 
        year: new Date().getFullYear().toString(), 
        title: '', 
        documentUrl: '', 
        category: 'dian', 
        status: 'public' 
    });
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            toast.error('Solo se permiten documentos en formato PDF para transparencia.');
            return;
        }

        setUploading(true);
        try {
            const uploadData = new FormData();
            uploadData.append('file', file);
            uploadData.append('folder', 'financial_reports');

            const uploadUrl = `${API}/media/upload?folder=financial_reports&clubId=${club?.id}`;
            const res = await fetch(uploadUrl, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: uploadData
            });

            if (res.ok) {
                const data = await res.json();
                setFormData({ ...formData, documentUrl: data.url });
                toast.success('PDF subido al repositorio exitosamente');
            } else {
                toast.error('Error al subir el archivo');
            }
        } catch (error) {
            toast.error('Error de red al subir PDF');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.documentUrl) {
            toast.error('Debes subir un documento PDF o proporcionar una URL válida.');
            return;
        }
        
        setSaving(true);
        try {
            await fetch(`${API}/financial/reports`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(formData)
            });
            toast.success('Registro de transparencia guardado');
            onSave();
        } catch (error) {
            toast.error('Error al guardar el registro legal');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-scale-up">
            <h2 className="text-xl font-black mb-4 flex items-center gap-2 text-slate-800"><Building2 className="w-6 h-6" /> {report ? 'Editar' : 'Cargar'} Documento Legal</h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">Título del Documento</label><input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full mt-1 p-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-slate-800 outline-none transition-all" placeholder="Ej. Informe Régimen Tributario Especial DIAN" required /></div>
                    
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Año Fiscal Contable</label><input type="number" min="1900" max="2100" value={formData.year} onChange={e => setFormData({...formData, year: e.target.value})} className="w-full mt-1 p-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-slate-800 outline-none transition-all" required /></div>
                    
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Privacidad</label>
                        <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full mt-1 p-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-slate-800 outline-none transition-all">
                            <option value="public">🌍 Público (Transparencia Web)</option>
                            <option value="private">🔒 Privado (Solo Socios)</option>
                        </select>
                    </div>

                    <div className="col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">Categoría Legal</label>
                        <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full mt-1 p-2.5 border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:ring-2 focus:ring-slate-800 outline-none transition-all">
                            <option value="dian">DIAN / Impuestos y Régimen Especial</option>
                            <option value="financial">Estados Financieros y Balances</option>
                            <option value="management">Informes de Presidencia y Gestión</option>
                            <option value="other">Otros Documentos de Padrón Rotario</option>
                        </select>
                    </div>

                    <div className="col-span-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">Archivo Físico (PDF)</label>
                        <div className="mt-1 flex flex-col gap-2">
                            {formData.documentUrl && (
                                <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-3">
                                    <FileText className="w-5 h-5 text-red-500" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-900 truncate">Documento_Cargado.pdf</p>
                                        <a href={formData.documentUrl} target="_blank" rel="noreferrer" className="text-xs text-rotary-blue hover:underline mt-0.5 inline-block">Ver documento adjunto</a>
                                    </div>
                                    <button type="button" onClick={() => setFormData({...formData, documentUrl: ''})} className="p-1.5 bg-white text-gray-400 hover:text-red-500 rounded-lg border border-gray-200 shadow-sm"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            )}
                            
                            {!formData.documentUrl && (
                                <div className="relative border-2 border-dashed border-gray-300 rounded-xl p-8 hover:bg-gray-50 transition-colors text-center">
                                    <input type="file" accept="application/pdf" onChange={handleFileUpload} disabled={uploading} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
                                    <div className="flex justify-center mb-2">
                                        {uploading ? <Loader2 className="w-8 h-8 text-rotary-blue animate-spin" /> : <Upload className="w-8 h-8 text-gray-400" />}
                                    </div>
                                    <p className="text-sm font-bold text-gray-700">{uploading ? 'Subiendo archivo seguro...' : 'Haz clic o arrastra un archivo PDF'}</p>
                                    <p className="text-xs text-gray-500 mt-1">Límite: 10MB por documento</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex gap-2 pt-4">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl font-bold text-gray-600 hover:bg-gray-50">Cancelar</button>
                    <button type="submit" disabled={saving || uploading} className="flex-1 px-4 py-2.5 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 disabled:opacity-50 flex justify-center items-center gap-2">
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {saving ? 'Validando...' : 'Publicar Documento'}
                    </button>
                </div>
            </form>
        </div>
    );
};
