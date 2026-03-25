import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { Users, Plus, Trash2, Edit2, Loader2, Globe, MapPin, BadgeCheck, Mail, Phone } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const RotexAdmin: React.FC = () => {
    const { token } = useAuth();
    const [members, setMembers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMember, setEditingMember] = useState<any>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/rotex/members`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setMembers(await res.json());
        } catch (error) {
            console.error('Error fetching ROTEX members:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Seguro que deseas eliminar este miembro de Rotex?')) return;
        try {
            await fetch(`${API}/rotex/members/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchData();
        } catch (error) {
            alert('Error al eliminar');
        }
    };

    if (loading) {
        return <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-pink-600" /></div>;
    }

    return (
        <div className="max-w-6xl mx-auto pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg bg-gradient-to-br from-pink-500 to-rose-600">
                        <Globe className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">Directorio ROTEX</h1>
                        <p className="text-gray-500 font-medium mt-1">Ex-intercambistas y Alumni de Rotary</p>
                    </div>
                </div>
                <button
                    onClick={() => { setEditingMember(null); setIsModalOpen(true); }}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl transition-all shadow-md active:scale-95"
                >
                    <Plus className="w-5 h-5" /> Registrar Alumni
                </button>
            </div>

            {/* Members Grid */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-fade-in">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Users className="w-5 h-5 text-pink-600" /> Padron Oficial
                    </h3>
                    <span className="text-sm px-3 py-1 bg-pink-50 text-pink-700 rounded-full font-bold">Total: {members.length}</span>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase font-bold text-gray-500">
                            <tr>
                                <th className="px-6 py-4">Ex-intercambista</th>
                                <th className="px-6 py-4">Año Intercambio</th>
                                <th className="px-6 py-4">País Destino/Origen</th>
                                <th className="px-6 py-4">Rol & Estado</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {members.map(m => (
                                <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-gray-200 flex-shrink-0 bg-cover bg-center border border-gray-200" style={{ backgroundImage: m.image ? `url(${m.image})` : 'none' }}>
                                                {!m.image && <Users className="w-5 h-5 text-gray-400 m-auto mt-2.5" />}
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-900">{m.name}</p>
                                                <div className="flex gap-2 text-xs text-gray-500 mt-0.5">
                                                    {m.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {m.email}</span>}
                                                    {m.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {m.phone}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-bold text-gray-900">{m.exchangeYear || '—'}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-bold text-pink-600 flex items-center gap-1">
                                            <MapPin className="w-4 h-4" /> {m.exchangeCountry || '—'}
                                        </p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-bold rounded-lg uppercase">
                                                {m.role === 'president' ? 'Presidente' : m.role === 'mentor' ? 'Mentor' : 'Miembro'}
                                            </span>
                                            {m.status === 'active' ? (
                                                <span className="w-2.5 h-2.5 bg-green-500 rounded-full" title="Activo"></span>
                                            ) : (
                                                <span className="w-2.5 h-2.5 bg-gray-300 rounded-full" title="Inactivo"></span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button onClick={() => { setEditingMember(m); setIsModalOpen(true); }} className="p-2 text-gray-400 hover:text-blue-600 transition-colors"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => handleDelete(m.id)} className="p-2 text-gray-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                                    </td>
                                </tr>
                            ))}
                            {members.length === 0 && (
                                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 text-sm">No hay ex-intercambistas registrados.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <MemberModal 
                        member={editingMember} 
                        onClose={() => setIsModalOpen(false)} 
                        onSave={() => { setIsModalOpen(false); fetchData(); }} 
                        token={token}
                    />
                </div>
            )}
        </div>
    );
};

export default RotexAdmin;

const MemberModal = ({ member, onClose, onSave, token }: any) => {
    const [formData, setFormData] = useState(member || { 
        name: '', email: '', phone: '', exchangeYear: '', exchangeCountry: '', role: 'member', status: 'active', image: '' 
    });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await fetch(`${API}/rotex/members`, {
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
            <h2 className="text-xl font-black mb-4 flex items-center gap-2 text-pink-600"><BadgeCheck className="w-6 h-6" /> {member ? 'Editar' : 'Nuevo'} Alumni ROTEX</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">Nombre Completo</label><input type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" required /></div>
                    
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Email</label><input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Teléfono</label><input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                    
                    <div><label className="text-xs font-bold text-gray-500 uppercase">Año Intercambio</label><input type="text" value={formData.exchangeYear} onChange={e => setFormData({...formData, exchangeYear: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" placeholder="Ej. 2018-2019" /></div>
                    <div><label className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1"><MapPin className="w-3 h-3 text-pink-600"/> País Destino/Origen</label><input type="text" value={formData.exchangeCountry} onChange={e => setFormData({...formData, exchangeCountry: e.target.value})} className="w-full mt-1 p-2 border rounded-xl border-pink-200" placeholder="Ej. Francia" /></div>

                    <div><label className="text-xs font-bold text-gray-500 uppercase">Rol Organizativo</label>
                        <select value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} className="w-full mt-1 p-2 border rounded-xl bg-white">
                            <option value="member">Miembro Base</option>
                            <option value="mentor">Mentor Oficial</option>
                            <option value="president">Presidente Ex-Alumno</option>
                        </select>
                    </div>

                    <div><label className="text-xs font-bold text-gray-500 uppercase">Estado</label>
                        <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full mt-1 p-2 border rounded-xl bg-white">
                            <option value="active">Activo (Participativo)</option>
                            <option value="inactive">Inactivo / Retirado</option>
                        </select>
                    </div>

                    <div className="col-span-2"><label className="text-xs font-bold text-gray-500 uppercase">Foto de Perfil (URL)</label><input type="url" value={formData.image} onChange={e => setFormData({...formData, image: e.target.value})} className="w-full mt-1 p-2 border rounded-xl" /></div>
                </div>
                <div className="flex gap-2 pt-4">
                    <button type="button" onClick={onClose} className="flex-1 px-4 py-2 border border-gray-200 rounded-xl font-bold text-gray-600">Cancelar</button>
                    <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-pink-600 text-white rounded-xl font-bold hover:bg-pink-700">{saving ? 'Guardando...' : 'Guardar'}</button>
                </div>
            </form>
        </div>
    );
};
