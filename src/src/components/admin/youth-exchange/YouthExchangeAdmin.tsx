import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Globe, PlaneTakeoff, PlaneLanding, Home, Plus, Trash2, Edit2, Calendar, MapPin, Loader2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const YouthExchangeAdmin: React.FC = () => {
    const { token } = useAuth();
    const [activeTab, setActiveTab] = useState<'inbounds' | 'outbounds' | 'families'>('inbounds');
    
    const [students, setStudents] = useState<any[]>([]);
    const [families, setFamilies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Modals
    const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
    const [editingStudent, setEditingStudent] = useState<any>(null);
    const [studentType, setStudentType] = useState<'inbound' | 'outbound'>('inbound');
    
    const [isFamilyModalOpen, setIsFamilyModalOpen] = useState(false);
    const [editingFamily, setEditingFamily] = useState<any>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [stdRes, famRes] = await Promise.all([
                fetch(`${API}/youth-exchange/students`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API}/youth-exchange/families`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            
            if (stdRes.ok) setStudents(await stdRes.json());
            if (famRes.ok) setFamilies(await famRes.json());
        } catch (error) {
            console.error('Error fetching RYE data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteStudent = async (id: string) => {
        if (!confirm('¿Seguro que deseas eliminar este estudiante?')) return;
        try {
            await fetch(`${API}/youth-exchange/students/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchData();
        } catch (error) {
            alert('Error al eliminar');
        }
    };

    const handleDeleteFamily = async (id: string) => {
        if (!confirm('¿Seguro que deseas eliminar esta familia?')) return;
        try {
            await fetch(`${API}/youth-exchange/families/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchData();
        } catch (error) {
            alert('Error al eliminar');
        }
    };

    const inbounds = students.filter(s => s.type === 'inbound');
    const outbounds = students.filter(s => s.type === 'outbound');

    const renderStudentTab = (type: 'inbound' | 'outbound', list: any[]) => (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        {type === 'inbound' ? <PlaneLanding className="w-5 h-5 text-indigo-500" /> : <PlaneTakeoff className="w-5 h-5 text-orange-500" />}
                        {type === 'inbound' ? 'Estudiantes Inbounds (Extranjeros)' : 'Estudiantes Outbounds (Locales)'}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Total: {list.length} jóvenes en programa.</p>
                </div>
                <button
                    onClick={() => { 
                        setStudentType(type);
                        setEditingStudent(null); 
                        setIsStudentModalOpen(true); 
                    }}
                    className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-bold rounded-xl transition-transform active:scale-95 ${type === 'inbound' ? 'bg-indigo-500' : 'bg-orange-500'}`}
                >
                    <Plus className="w-4 h-4" /> Registrar {type === 'inbound' ? 'Inbound' : 'Outbound'}
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase font-bold text-gray-500">
                        <tr>
                            <th className="px-6 py-4">Estudiante</th>
                            <th className="px-6 py-4">{type === 'inbound' ? 'País de Origen' : 'País Destino'}</th>
                            <th className="px-6 py-4">Club {type === 'inbound' ? 'Patrocinador' : 'Anfitrión'}</th>
                            <th className="px-6 py-4">Periodo</th>
                            <th className="px-6 py-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {list.map(s => (
                            <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0 bg-cover bg-center border border-gray-200" style={{ backgroundImage: s.image ? `url(${s.image})` : 'none' }}>
                                            {!s.image && <Globe className="w-5 h-5 text-gray-400 m-auto mt-2.5" />}
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900">{s.name}</p>
                                            <p className="text-xs text-gray-500">{s.status === 'active' ? 'Activo' : s.status === 'returned' ? 'Retornado' : 'Planeado'}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                                    {s.country || '—'}
                                </td>
                                <td className="px-6 py-4">
                                    <p className="text-sm font-bold text-gray-900">{s.sponsorClubName || '—'}</p>
                                    <p className="text-xs text-gray-500">Consejero: {s.counselorName || 'N/A'}</p>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-900">
                                    {s.academicYear || '—'}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => { setStudentType(type); setEditingStudent(s); setIsStudentModalOpen(true); }} className="p-2 text-gray-400 hover:text-blue-600 transition-colors"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={() => handleDeleteStudent(s.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                </td>
                            </tr>
                        ))}
                        {list.length === 0 && (
                            <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 text-sm">No hay estudiantes registrados.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderFamiliesTab = () => (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Home className="w-5 h-5 text-emerald-500" />
                        Familias Anfitrionas
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Total: {families.length} familias registradas.</p>
                </div>
                <button
                    onClick={() => { setEditingFamily(null); setIsFamilyModalOpen(true); }}
                    className="flex items-center gap-2 px-4 py-2 text-white text-sm font-bold rounded-xl transition-transform active:scale-95 bg-emerald-500"
                >
                    <Plus className="w-4 h-4" /> Agregar Familia
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                {families.map(f => (
                    <div key={f.id} className="border border-gray-100 rounded-2xl p-5 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <Home className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900">{f.familyName}</h4>
                                    <p className="text-xs text-gray-500">Familia Anfitriona</p>
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <button onClick={() => { setEditingFamily(f); setIsFamilyModalOpen(true); }} className="text-gray-400 hover:text-blue-500"><Edit2 className="w-4 h-4" /></button>
                                <button onClick={() => handleDeleteFamily(f.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                            </div>
                        </div>
                        <div className="space-y-2 text-sm text-gray-600 mb-4">
                            <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-gray-400" /> <span className="truncate">{f.address || '—'}</span></p>
                            <p className="flex items-center gap-2"><span className="font-bold w-4 text-center">@</span> <span className="truncate">{f.email || '—'}</span></p>
                            <p className="flex items-center gap-2"><span className="font-bold w-4 text-center">#</span> <span>{f.phone || '—'}</span></p>
                        </div>
                        <div className="pt-4 border-t border-gray-100">
                            <p className="text-xs font-bold text-gray-500 uppercase mb-1">Inbound Asignado</p>
                            {f.studentId ? (
                                <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg truncate block">
                                    {f.student?.name || 'Estudiante'}
                                </span>
                            ) : (
                                <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs font-bold rounded-lg">Libre / Sin asignar</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            {families.length === 0 && (
                <div className="p-12 text-center text-gray-400 text-sm">No hay familias anfitrionas registradas.</div>
            )}
        </div>
    );

    if (loading) {
        return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-rotary-blue" /></div>;
    }

    return (
        <div className="max-w-6xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg bg-gradient-to-br from-indigo-500 to-blue-600">
                        <Globe className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Rotary Youth Exchange</h1>
                        <p className="text-gray-500 font-medium mt-1">Gestión de Intercambios de Jóvenes Inbound y Outbound</p>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 mb-8 bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm w-fit">
                {[
                    { id: 'inbounds', label: 'Inbounds (Extranjeros)', icon: PlaneLanding, color: 'bg-indigo-500' },
                    { id: 'outbounds', label: 'Outbounds (Locales)', icon: PlaneTakeoff, color: 'bg-orange-500' },
                    { id: 'families', label: 'Familias Anfitrionas', icon: Home, color: 'bg-emerald-500' },
                ].map(tab => {
                    const active = activeTab === tab.id;
                    const TIcon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                                active ? `text-white shadow-sm ${tab.color}` : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                        >
                            <TIcon className="w-4 h-4" /> {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Content Area */}
            {activeTab === 'inbounds' && renderStudentTab('inbound', inbounds)}
            {activeTab === 'outbounds' && renderStudentTab('outbound', outbounds)}
            {activeTab === 'families' && renderFamiliesTab()}

            {/* Modals */}
            {isStudentModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <StudentModal 
                        type={studentType}
                        student={editingStudent} 
                        onClose={() => setIsStudentModalOpen(false)} 
                        onSave={() => { setIsStudentModalOpen(false); fetchData(); }} 
                        token={token}
                    />
                </div>
            )}

            {isFamilyModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <FamilyModal 
                        family={editingFamily} 
                        inbounds={inbounds}
                        onClose={() => setIsFamilyModalOpen(false)} 
                        onSave={() => { setIsFamilyModalOpen(false); fetchData(); }} 
                        token={token}
                    />
                </div>
            )}
        </div>
    );
};

export default YouthExchangeAdmin;

// Helper Modals

const StudentModal = ({ type, student, onClose, onSave, token }: any) => {
    const [formData, setFormData] = useState(student || { 
        type: type, name: '', email: '', phone: '', country: '', sponsorClubName: '', academicYear: '', status: 'active', image: '', counselorName: '' 
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await fetch(`${API}/youth-exchange/students`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(formData)
            });
            onSave();
        } catch (error) {
            alert('Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl animate-scale-up">
            <h2 className="text-xl font-black mb-4 flex items-center gap-2">
                {type === 'inbound' ? <PlaneLanding className="text-indigo-500" /> : <PlaneTakeoff className="text-orange-500" />}
                {student ? 'Editar' : 'Nuevo'} {type === 'inbound' ? 'Inbound' : 'Outbound'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">Nombre Completo</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" required /></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase">{type === 'inbound' ? 'País de Origen' : 'País Destino'}</label><input type="text" value={formData.country} onChange={e => setFormData({...formData, country: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" required /></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Año Académico</label><input type="text" value={formData.academicYear} onChange={e => setFormData({...formData, academicYear: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" placeholder="2024-2025" /></div>
                    <div className="col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">Club {type === 'inbound' ? 'Patrocinador (Extranjero)' : 'Anfitrión (Extranjero)'}</label><input type="text" value={formData.sponsorClubName} onChange={e => setFormData({...formData, sponsorClubName: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Consejero Rotario</label><input type="text" value={formData.counselorName} onChange={e => setFormData({...formData, counselorName: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Estado</label>
                        <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full mt-1 p-2 border rounded-xl bg-white">
                            <option value="planned">Planeado (No ha viajado)</option>
                            <option value="active">Activo (En intercambio)</option>
                            <option value="returned">Retornado (Finalizado)</option>
                        </select>
                    </div>
                </div>
                <div className="flex gap-2 pt-4">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl font-bold text-gray-600">Cancelar</button>
                    <button type="submit" disabled={saving} className={`flex-1 px-4 py-2 text-white rounded-xl font-bold ${type === 'inbound' ? 'bg-indigo-500' : 'bg-orange-500'}`}>{saving ? 'Guardando...' : 'Guardar'}</button>
                </div>
            </form>
        </div>
    );
};

const FamilyModal = ({ family, inbounds, onClose, onSave, token }: any) => {
    const [formData, setFormData] = useState(family || { 
        familyName: '', address: '', phone: '', email: '', studentId: '', startDate: '', endDate: '' 
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await fetch(`${API}/youth-exchange/families`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify(formData)
            });
            onSave();
        } catch (error) {
            alert('Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-scale-up">
            <h2 className="text-xl font-black mb-4 flex items-center gap-2"><Home className="text-emerald-500" /> {family ? 'Editar' : 'Nueva'} Familia</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div><label className="text-xs font-bold text-gray-500 uppercase">Nombre (Ej. Familia Pérez)</label><input type="text" value={formData.familyName} onChange={e => setFormData({...formData, familyName: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" required /></div>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Dirección</label><input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Teléfono</label><input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Email</label><input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                </div>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Estudiante Inbound Asignado</label>
                    <select value={formData.studentId || ''} onChange={e => setFormData({...formData, studentId: e.target.value})} className="w-full mt-1 p-2 border rounded-xl bg-white">
                        <option value="">Ninguno / Libre</option>
                        {inbounds.map((s: any) => (
                            <option key={s.id} value={s.id}>{s.name} ({s.country})</option>
                        ))}
                    </select>
                </div>
                <div className="flex gap-2 pt-4">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl font-bold text-gray-600">Cancelar</button>
                    <button type="submit" disabled={saving} className="flex-1 px-4 py-2 text-white rounded-xl font-bold bg-emerald-500">{saving ? 'Guardando...' : 'Guardar'}</button>
                </div>
            </form>
        </div>
    );
};
