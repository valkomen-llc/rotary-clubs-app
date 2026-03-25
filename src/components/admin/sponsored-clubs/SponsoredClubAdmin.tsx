import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Users, Info, FolderKanban, Save, Plus, Trash2, Edit2, Calendar, MapPin, Link as LinkIcon, Facebook, Instagram, AlertCircle, Loader2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

interface SponsoredClubAdminProps {
    type: 'rotaract' | 'interact';
    title: string;
    description: string;
    brandColor: string;
    icon: React.ElementType;
}

const SponsoredClubAdmin: React.FC<SponsoredClubAdminProps> = ({ type, title, description, brandColor, icon: Icon }) => {
    const { token } = useAuth();
    const [activeTab, setActiveTab] = useState<'info' | 'members' | 'projects'>('info');
    
    const [clubInfo, setClubInfo] = useState<any>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [projects, setProjects] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Form states
    const [formData, setFormData] = useState({
        name: '',
        foundationDate: '',
        meetingInfo: '',
        description: '',
        logo: '',
        facebookUrl: '',
        instagramUrl: ''
    });

    // Modals
    const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
    const [editingMember, setEditingMember] = useState<any>(null);
    
    const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
    const [editingProject, setEditingProject] = useState<any>(null);

    useEffect(() => {
        fetchData();
    }, [type]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/sponsored-clubs/${type}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setClubInfo(data);
                setMembers(data.members || []);
                setProjects(data.projects || []);
                
                if (data.id) {
                    setFormData({
                        name: data.name || '',
                        foundationDate: data.foundationDate ? new Date(data.foundationDate).toISOString().split('T')[0] : '',
                        meetingInfo: data.meetingInfo || '',
                        description: data.description || '',
                        logo: data.logo || '',
                        facebookUrl: data.facebookUrl || '',
                        instagramUrl: data.instagramUrl || ''
                    });
                } else {
                    setFormData(prev => ({ ...prev, name: title }));
                }
            }
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveInfo = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const res = await fetch(`${API}/sponsored-clubs/${type}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                alert('Información guardada exitosamente');
                fetchData();
            }
        } catch (error) {
            console.error(error);
            alert('Error al guardar');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteMember = async (id: string) => {
        if (!confirm('¿Seguro que deseas eliminar este miembro?')) return;
        try {
            await fetch(`${API}/sponsored-clubs/${type}/members/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchData();
        } catch (error) {
            alert('Error al eliminar');
        }
    };

    const handleDeleteProject = async (id: string) => {
        if (!confirm('¿Seguro que deseas eliminar este proyecto?')) return;
        try {
            await fetch(`${API}/sponsored-clubs/${type}/projects/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchData();
        } catch (error) {
            alert('Error al eliminar');
        }
    };

    const calculateAge = (birthDate: string) => {
        if (!birthDate) return null;
        const today = new Date();
        const birthDateObj = new Date(birthDate);
        let age = today.getFullYear() - birthDateObj.getFullYear();
        const m = today.getMonth() - birthDateObj.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDateObj.getDate())) {
            age--;
        }
        return age;
    };

    // --- Sub-components (Tabs) --- //

    const renderInfoTab = () => (
        <form onSubmit={handleSaveInfo} className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-2">
                <Info className="w-5 h-5" style={{ color: brandColor }} />
                Información del Club
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Nombre del Club</label>
                    <input
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-opacity-50 transition-all font-medium text-gray-900"
                        style={{ '--tw-ring-color': brandColor } as React.CSSProperties}
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Fecha de Fundación</label>
                    <input
                        type="date"
                        value={formData.foundationDate}
                        onChange={e => setFormData({...formData, foundationDate: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-opacity-50 transition-all font-medium text-gray-900"
                    />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-gray-700 mb-2">Descripción General</label>
                    <textarea
                        rows={3}
                        value={formData.description}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-opacity-50 transition-all text-sm text-gray-700 resize-none"
                        placeholder="Cuenta un poco sobre la misión y visión de este club..."
                    />
                </div>
                <div className="md:col-span-2">
                    <label className="block text-sm font-bold text-gray-700 mb-2">Lugar y Horario de Reunión</label>
                    <input
                        type="text"
                        value={formData.meetingInfo}
                        onChange={e => setFormData({...formData, meetingInfo: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-opacity-50 transition-all font-medium text-gray-900"
                        placeholder="Ej. Sábados 4:00 PM, Salón Comunal..."
                    />
                </div>
                <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">Logo URL (Opcional)</label>
                    <input
                        type="url"
                        value={formData.logo}
                        onChange={e => setFormData({...formData, logo: e.target.value})}
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-opacity-50 transition-all font-medium text-sm text-gray-900"
                        placeholder="https://..."
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Facebook URL</label>
                        <input
                            type="url"
                            value={formData.facebookUrl}
                            onChange={e => setFormData({...formData, facebookUrl: e.target.value})}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-opacity-50 transition-all font-medium text-sm text-gray-900"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2">Instagram URL</label>
                        <input
                            type="url"
                            value={formData.instagramUrl}
                            onChange={e => setFormData({...formData, instagramUrl: e.target.value})}
                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-opacity-50 transition-all font-medium text-sm text-gray-900"
                        />
                    </div>
                </div>
            </div>
            
            <div className="mt-8 flex justify-end">
                <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-3 text-white rounded-xl font-bold transition-transform active:scale-95 disabled:opacity-50"
                    style={{ backgroundColor: brandColor }}
                >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    Guardar Cambios
                </button>
            </div>
        </form>
    );

    const renderMembersTab = () => (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Users className="w-5 h-5" style={{ color: brandColor }} />
                        Directorio de Miembros
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Total: {members.length} jóvenes inscritos.</p>
                </div>
                <button
                    onClick={() => { setEditingMember(null); setIsMemberModalOpen(true); }}
                    className="flex items-center gap-2 px-4 py-2 text-white text-sm font-bold rounded-xl transition-transform active:scale-95"
                    style={{ backgroundColor: brandColor }}
                >
                    <Plus className="w-4 h-4" /> Agregar Miembro
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase font-bold text-gray-500">
                        <tr>
                            <th className="px-6 py-4">Socio</th>
                            <th className="px-6 py-4">Rol en JD</th>
                            <th className="px-6 py-4">Edad</th>
                            <th className="px-6 py-4">Contacto</th>
                            <th className="px-6 py-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {members.map(m => {
                            const age = calculateAge(m.birthDate);
                            const ageWarning = type === 'rotaract' && age && (age < 18 || age > 30) 
                                ? 'Edad típica: 18-30' 
                                : type === 'interact' && age && (age < 12 || age > 18) 
                                    ? 'Edad típica: 12-18' : null;

                            return (
                            <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0 bg-cover bg-center border border-gray-200" style={{ backgroundImage: m.image ? `url(${m.image})` : 'none' }}>
                                            {!m.image && <Users className="w-5 h-5 text-gray-400 m-auto mt-2.5" />}
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900">{m.name}</p>
                                            <p className="text-xs text-gray-500">{m.isBoard ? 'Mesa Directiva' : 'Socio'}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600 font-medium">{m.role || '—'}</td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold text-gray-900">{age || '—'}</span>
                                        {ageWarning && <AlertCircle className="w-4 h-4 text-amber-500" title={ageWarning} />}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <p className="text-sm text-gray-900">{m.email || '—'}</p>
                                    <p className="text-xs text-gray-500">{m.phone || '—'}</p>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => { setEditingMember(m); setIsMemberModalOpen(true); }} className="p-2 text-gray-400 hover:text-blue-600 transition-colors"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={() => handleDeleteMember(m.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                </td>
                            </tr>
                        )})}
                        {members.length === 0 && (
                            <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 text-sm">No hay miembros registrados. Añade el primer socio.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );

    const renderProjectsTab = () => (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <FolderKanban className="w-5 h-5" style={{ color: brandColor }} />
                        Proyectos Juveniles
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Total: {projects.length} proyectos registrados.</p>
                </div>
                <button
                    onClick={() => { setEditingProject(null); setIsProjectModalOpen(true); }}
                    className="flex items-center gap-2 px-4 py-2 text-white text-sm font-bold rounded-xl transition-transform active:scale-95"
                    style={{ backgroundColor: brandColor }}
                >
                    <Plus className="w-4 h-4" /> Crear Proyecto
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                {projects.map(p => (
                    <div key={p.id} className="border border-gray-100 rounded-2xl overflow-hidden hover:shadow-md transition-shadow group">
                        <div className="h-40 bg-gray-100 relative bg-cover bg-center" style={{ backgroundImage: `url(${p.image || 'https://via.placeholder.com/400x200?text=Sin+Imagen'})`}}>
                            <div className="absolute top-3 right-3 px-2 py-1 bg-white/90 rounded text-[10px] font-black uppercase text-gray-700">
                                {p.status === 'completed' ? 'Finalizado' : p.status === 'active' ? 'En ejecución' : 'Planeado'}
                            </div>
                        </div>
                        <div className="p-5">
                            <h4 className="font-bold text-gray-900 mb-2 truncate">{p.title}</h4>
                            <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed mb-4">{p.description}</p>
                            <div className="flex items-center justify-between text-xs font-bold text-gray-400">
                                <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {p.date ? new Date(p.date).toLocaleDateString() : 'Sin fecha'}</span>
                                <div className="flex gap-2">
                                    <button onClick={() => { setEditingProject(p); setIsProjectModalOpen(true); }} className="hover:text-blue-500 transition-colors"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={() => handleDeleteProject(p.id)} className="hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            {projects.length === 0 && (
                <div className="p-12 text-center text-gray-400 text-sm">No hay proyectos registrados. Celebra su primer proyecto.</div>
            )}
        </div>
    );

    if (loading) {
        return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin" style={{ color: brandColor }} /></div>;
    }

    return (
        <div className="max-w-6xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg" style={{ backgroundColor: brandColor }}>
                        <Icon className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">{title}</h1>
                        <p className="text-gray-500 font-medium mt-1">{description}</p>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 mb-8 bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm w-fit">
                {[
                    { id: 'info', label: 'Información', icon: Info },
                    { id: 'members', label: 'Miembros', icon: Users },
                    { id: 'projects', label: 'Proyectos', icon: FolderKanban },
                ].map(tab => {
                    const active = activeTab === tab.id;
                    const TIcon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                                active ? 'text-white shadow-sm' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                            }`}
                            style={{ backgroundColor: active ? brandColor : 'transparent' }}
                        >
                            <TIcon className="w-4 h-4" /> {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Content Area */}
            <div className="animate-fade-in">
                {activeTab === 'info' && renderInfoTab()}
                {activeTab === 'members' && renderMembersTab()}
                {activeTab === 'projects' && renderProjectsTab()}
            </div>

            {/* Member Modal Integration - (A complete implementation would put Modal component here) */}
            {isMemberModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <MemberModal 
                        type={type} 
                        member={editingMember} 
                        onClose={() => setIsMemberModalOpen(false)} 
                        onSave={() => { setIsMemberModalOpen(false); fetchData(); }} 
                        token={token}
                        brandColor={brandColor}
                    />
                </div>
            )}

            {/* Project Modal Integration */}
            {isProjectModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <ProjectModal 
                        type={type} 
                        project={editingProject} 
                        onClose={() => setIsProjectModalOpen(false)} 
                        onSave={() => { setIsProjectModalOpen(false); fetchData(); }} 
                        token={token}
                        brandColor={brandColor}
                    />
                </div>
            )}
        </div>
    );
};

export default SponsoredClubAdmin;

// Helper Modals

const MemberModal = ({ type, member, onClose, onSave, token, brandColor }: any) => {
    const [formData, setFormData] = useState(member || { name: '', role: '', email: '', phone: '', birthDate: '', isBoard: false, image: '' });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await fetch(`${API}/sponsored-clubs/${type}/members`, {
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
            <h2 className="text-xl font-black mb-4">{member ? 'Editar Miembro' : 'Nuevo Miembro'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div><label className="text-xs font-bold text-gray-500 uppercase">Nombre Completo</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" required /></div>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Cargo / Rol</label><input type="text" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" placeholder="Ej. Presidente" /></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Fecha Nac.</label><input type="date" value={formData.birthDate ? formData.birthDate.split('T')[0] : ''} onChange={e => setFormData({...formData, birthDate: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Mesa Directiva</label>
                        <select value={formData.isBoard ? '1' : '0'} onChange={e => setFormData({...formData, isBoard: e.target.value === '1'})} className="w-full mt-1 p-2 border rounded-xl bg-white">
                            <option value="0">Socio Regular</option>
                            <option value="1">Sí (Directiva)</option>
                        </select>
                    </div>
                </div>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Email</label><input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Url Foto</label><input type="url" value={formData.image} onChange={e => setFormData({...formData, image: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                
                <div className="flex gap-2 pt-4">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl font-bold text-gray-600">Cancelar</button>
                    <button type="submit" disabled={saving} className="flex-1 px-4 py-2 text-white rounded-xl font-bold" style={{ backgroundColor: brandColor }}>{saving ? 'Guardando...' : 'Guardar'}</button>
                </div>
            </form>
        </div>
    );
};

const ProjectModal = ({ type, project, onClose, onSave, token, brandColor }: any) => {
    const [formData, setFormData] = useState(project || { title: '', description: '', date: '', status: 'completed', image: '' });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await fetch(`${API}/sponsored-clubs/${type}/projects`, {
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
            <h2 className="text-xl font-black mb-4">{project ? 'Editar Proyecto' : 'Nuevo Proyecto'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div><label className="text-xs font-bold text-gray-500 uppercase">Título del Proyecto</label><input type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" required /></div>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Descripción</label><textarea rows={3} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" required /></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Fecha</label><input type="date" value={formData.date ? formData.date.split('T')[0] : ''} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Estado</label>
                        <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full mt-1 p-2 border rounded-xl bg-white">
                            <option value="planned">Planeado</option>
                            <option value="active">En progreso</option>
                            <option value="completed">Finalizado</option>
                        </select>
                    </div>
                </div>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Imagen de Portada (URL)</label><input type="url" value={formData.image} onChange={e => setFormData({...formData, image: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                
                <div className="flex gap-2 pt-4">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl font-bold text-gray-600">Cancelar</button>
                    <button type="submit" disabled={saving} className="flex-1 px-4 py-2 text-white rounded-xl font-bold" style={{ backgroundColor: brandColor }}>{saving ? 'Guardando...' : 'Guardar'}</button>
                </div>
            </form>
        </div>
    );
};
