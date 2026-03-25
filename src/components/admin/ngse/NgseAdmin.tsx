import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Briefcase, PlaneTakeoff, PlaneLanding, Home, Plus, Trash2, Edit2, MapPin, Loader2, Award } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const NgseAdmin: React.FC = () => {
    const { token } = useAuth();
    const [activeTab, setActiveTab] = useState<'inbounds' | 'outbounds' | 'families'>('inbounds');
    
    const [participants, setParticipants] = useState<any[]>([]);
    const [families, setFamilies] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Modals
    const [isParticipantModalOpen, setIsParticipantModalOpen] = useState(false);
    const [editingParticipant, setEditingParticipant] = useState<any>(null);
    const [participantType, setParticipantType] = useState<'inbound' | 'outbound'>('inbound');
    
    const [isFamilyModalOpen, setIsFamilyModalOpen] = useState(false);
    const [editingFamily, setEditingFamily] = useState<any>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [stdRes, famRes] = await Promise.all([
                fetch(`${API}/ngse/participants`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API}/ngse/families`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            
            if (stdRes.ok) setParticipants(await stdRes.json());
            if (famRes.ok) setFamilies(await famRes.json());
        } catch (error) {
            console.error('Error fetching NGSE data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteParticipant = async (id: string) => {
        if (!confirm('¿Seguro que deseas eliminar este participante?')) return;
        try {
            await fetch(`${API}/ngse/participants/${id}`, {
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
            await fetch(`${API}/ngse/families/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchData();
        } catch (error) {
            alert('Error al eliminar');
        }
    };

    const inbounds = participants.filter(p => p.type === 'inbound');
    const outbounds = participants.filter(p => p.type === 'outbound');

    const renderParticipantTab = (type: 'inbound' | 'outbound', list: any[]) => (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        {type === 'inbound' ? <PlaneLanding className="w-5 h-5 text-purple-600" /> : <PlaneTakeoff className="w-5 h-5 text-amber-500" />}
                        {type === 'inbound' ? 'Jóvenes Profesionales Inbound' : 'Jóvenes Profesionales Outbound'}
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Total: {list.length} perfiles NGSE.</p>
                </div>
                <button
                    onClick={() => { 
                        setParticipantType(type);
                        setEditingParticipant(null); 
                        setIsParticipantModalOpen(true); 
                    }}
                    className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-bold rounded-xl transition-transform active:scale-95 ${type === 'inbound' ? 'bg-purple-600' : 'bg-amber-500'}`}
                >
                    <Plus className="w-4 h-4" /> Registrar {type === 'inbound' ? 'Inbound' : 'Outbound'}
                </button>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase font-bold text-gray-500">
                        <tr>
                            <th className="px-6 py-4">Profesional</th>
                            <th className="px-6 py-4">Área / Vocación</th>
                            <th className="px-6 py-4">{type === 'inbound' ? 'País de Origen' : 'País Destino'}</th>
                            <th className="px-6 py-4">Club {type === 'inbound' ? 'Patrocinador' : 'Anfitrión'}</th>
                            <th className="px-6 py-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {list.map(p => (
                            <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0 bg-cover bg-center border border-gray-200" style={{ backgroundImage: p.image ? `url(${p.image})` : 'none' }}>
                                            {!p.image && <Briefcase className="w-5 h-5 text-gray-400 m-auto mt-2.5" />}
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900">{p.name}</p>
                                            <p className="text-xs text-gray-500">{p.status === 'active' ? 'Activo' : p.status === 'returned' ? 'Retornado' : 'Planeado'}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <p className="text-sm font-bold text-gray-900 font-medium">{p.profession || '—'}</p>
                                    <p className="text-xs text-emerald-600 font-bold mt-0.5">{p.serviceArea || '—'}</p>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                                    {p.country || '—'}
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-900">
                                    {p.sponsorClubName || '—'}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => { setParticipantType(type); setEditingParticipant(p); setIsParticipantModalOpen(true); }} className="p-2 text-gray-400 hover:text-blue-600 transition-colors"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={() => handleDeleteParticipant(p.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                </td>
                            </tr>
                        ))}
                        {list.length === 0 && (
                            <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 text-sm">No hay perfiles NGSE registrados.</td></tr>
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
                        <Home className="w-5 h-5 text-teal-600" />
                        Alojamiento / Familias Anfitrionas
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">Total: {families.length} domicilios/familias registradas.</p>
                </div>
                <button
                    onClick={() => { setEditingFamily(null); setIsFamilyModalOpen(true); }}
                    className="flex items-center gap-2 px-4 py-2 text-white text-sm font-bold rounded-xl transition-transform active:scale-95 bg-teal-600"
                >
                    <Plus className="w-4 h-4" /> Agregar Alojamiento
                </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                {families.map(f => (
                    <div key={f.id} className="border border-gray-100 rounded-2xl p-5 hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center">
                                    <Home className="w-5 h-5" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900">{f.familyName}</h4>
                                    <p className="text-xs text-gray-500">Alojamiento NGSE</p>
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
                            <p className="text-xs font-bold text-gray-500 uppercase mb-1">Profesional Inbound</p>
                            {f.participantId ? (
                                <span className="px-2 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-lg truncate block">
                                    {f.participant?.name || 'Profesional'}
                                </span>
                            ) : (
                                <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs font-bold rounded-lg">Libre / Sin asignar</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            {families.length === 0 && (
                <div className="p-12 text-center text-gray-400 text-sm">No hay alojamientos o familias registrados.</div>
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
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg bg-gradient-to-br from-purple-600 to-indigo-700">
                        <Briefcase className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Nuevas Generaciones (NGSE)</h1>
                        <p className="text-gray-500 font-medium mt-1">Intercambio de Jóvenes Profesionales y Servicio Humanitario</p>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-2 mb-8 bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm w-fit">
                {[
                    { id: 'inbounds', label: 'Inbounds (Extranjeros)', icon: PlaneLanding, color: 'bg-purple-600' },
                    { id: 'outbounds', label: 'Outbounds (Locales)', icon: PlaneTakeoff, color: 'bg-amber-500' },
                    { id: 'families', label: 'Alojamientos / Familias', icon: Home, color: 'bg-teal-600' },
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
            {activeTab === 'inbounds' && renderParticipantTab('inbound', inbounds)}
            {activeTab === 'outbounds' && renderParticipantTab('outbound', outbounds)}
            {activeTab === 'families' && renderFamiliesTab()}

            {/* Modals */}
            {isParticipantModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <ParticipantModal 
                        type={participantType}
                        participant={editingParticipant} 
                        onClose={() => setIsParticipantModalOpen(false)} 
                        onSave={() => { setIsParticipantModalOpen(false); fetchData(); }} 
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

export default NgseAdmin;

// Helper Modals

const ParticipantModal = ({ type, participant, onClose, onSave, token }: any) => {
    const [formData, setFormData] = useState(participant || { 
        type: type, name: '', email: '', phone: '', country: '', sponsorClubName: '', profession: '', serviceArea: '', status: 'active', image: '' 
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await fetch(`${API}/ngse/participants`, {
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
                {type === 'inbound' ? <PlaneLanding className="text-purple-600" /> : <PlaneTakeoff className="text-amber-500" />}
                {participant ? 'Editar' : 'Nuevo'} {type === 'inbound' ? 'Profesional Inbound' : 'Profesional Outbound'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">Nombre Completo</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" required /></div>
                    
                    <div className="col-span-2"><label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Briefcase className="w-3 h-3"/> Profesión / Carrera</label><input type="text" value={formData.profession} onChange={e => setFormData({...formData, profession: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" placeholder="Ej. Arquitectura, Medicina, Ingeniería" required /></div>
                    
                    <div className="col-span-2"><label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><Award className="w-3 h-3"/> Área de Servicio de Interés</label><input type="text" value={formData.serviceArea} onChange={e => setFormData({...formData, serviceArea: e.target.value})} className="w-full mt-1 p-2 border rounded-xl border-emerald-200 focus:ring-emerald-500" placeholder="Ej. Salud Materno-Infantil, Educación Básica" /></div>

                    <div><label className="text-xs font-bold text-gray-500 uppercase">{type === 'inbound' ? 'País de Origen' : 'País Destino'}</label><input type="text" value={formData.country} onChange={e => setFormData({...formData, country: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" required /></div>
                    
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Estado</label>
                        <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full mt-1 p-2 border rounded-xl bg-white">
                            <option value="planned">Planeado (En coordinación)</option>
                            <option value="active">Activo (En intercambio)</option>
                            <option value="returned">Retornado (Finalizado)</option>
                        </select>
                    </div>

                    <div className="col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">Club {type === 'inbound' ? 'Patrocinador (Extranjero)' : 'Anfitrión (Extranjero)'}</label><input type="text" value={formData.sponsorClubName} onChange={e => setFormData({...formData, sponsorClubName: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>

                    <div className="col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">Foto Especialista (URL)</label><input type="url" value={formData.image} onChange={e => setFormData({...formData, image: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                </div>
                <div className="flex gap-2 pt-4">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl font-bold text-gray-600">Cancelar</button>
                    <button type="submit" disabled={saving} className={`flex-1 px-4 py-2 text-white rounded-xl font-bold ${type === 'inbound' ? 'bg-purple-600' : 'bg-amber-500'}`}>{saving ? 'Guardando...' : 'Guardar'}</button>
                </div>
            </form>
        </div>
    );
};

const FamilyModal = ({ family, inbounds, onClose, onSave, token }: any) => {
    const [formData, setFormData] = useState(family || { 
        familyName: '', address: '', phone: '', email: '', participantId: '', startDate: '', endDate: '' 
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await fetch(`${API}/ngse/families`, {
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
            <h2 className="text-xl font-black mb-4 flex items-center gap-2"><Home className="text-teal-600" /> {family ? 'Editar' : 'Nuevo'} Alojamiento</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div><label className="text-xs font-bold text-gray-500 uppercase">Nombre Familia / Propietario</label><input type="text" value={formData.familyName} onChange={e => setFormData({...formData, familyName: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" required /></div>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Dirección Completa</label><input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Teléfono</label><input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Email</label><input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                </div>
                <div><label className="text-xs font-bold text-gray-500 uppercase">Profesional Inbound Asignado</label>
                    <select value={formData.participantId || ''} onChange={e => setFormData({...formData, participantId: e.target.value})} className="w-full mt-1 p-2 border rounded-xl bg-white">
                        <option value="">Ninguno / Libre</option>
                        {inbounds.map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name} ({p.profession})</option>
                        ))}
                    </select>
                </div>
                <div className="flex gap-2 pt-4">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl font-bold text-gray-600">Cancelar</button>
                    <button type="submit" disabled={saving} className="flex-1 px-4 py-2 text-white rounded-xl font-bold bg-teal-600">{saving ? 'Guardando...' : 'Guardar'}</button>
                </div>
            </form>
        </div>
    );
};
