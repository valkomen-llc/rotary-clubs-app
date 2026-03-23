import React, { useState, useEffect, useRef } from 'react';
import { Users, Plus, Loader2, Camera, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';

const API = import.meta.env.VITE_API_URL || '/api';

interface Member {
    id: string;
    name: string;
    image: string;
    description: string;
    isBoard: boolean;
    boardRole: string;
}

const MembersPage: React.FC = () => {
    const { user } = useAuth();
    const { club } = useClub();
    const token = localStorage.getItem('rotary_token');
    const clubId = club?.id || user?.clubId;

    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<string | null>(null);

    // ── Fetch members ──
    useEffect(() => {
        if (!clubId) return;
        fetch(`${API}/admin/clubs/${clubId}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => {
                if (d.members) setMembers(d.members.map((m: any) => ({
                    id: m.id, name: m.name || '', image: m.image || '', description: m.description || '',
                    isBoard: m.isBoard || false, boardRole: m.boardRole || ''
                })));
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [clubId]);

    const addMember = () => {
        setMembers(prev => [...prev, {
            id: Date.now().toString(), name: '', image: '', description: '', isBoard: false, boardRole: ''
        }]);
    };

    const updateMember = (index: number, field: keyof Member, value: any) => {
        setMembers(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const removeMember = (index: number) => {
        setMembers(prev => prev.filter((_, i) => i !== index));
    };

    const handleImageUpload = async (index: number, file: File) => {
        const fd = new FormData();
        fd.append('file', file);
        try {
            const res = await fetch(`${API}/media/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: fd,
            });
            const data = await res.json();
            const url = data.url || data.secure_url || '';
            if (url) updateMember(index, 'image', url);
        } catch { /* ignore */ }
    };

    const saveMembers = async () => {
        if (!clubId) return;
        setSaving(true);
        try {
            const validMembers = members.filter(m => m.name);
            await fetch(`${API}/admin/clubs/${clubId}/members/batch`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ members: validMembers }),
            });
            setToast('Miembros guardados correctamente');
            setTimeout(() => setToast(null), 3000);
        } catch { setToast('Error al guardar'); }
        setSaving(false);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
            </div>
        );
    }

    const boardMembers = members.filter(m => m.isBoard);

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                        <Users className="w-7 h-7 text-[#019fcb]" />
                        Miembros del Club
                    </h1>
                    <p className="text-sm text-gray-400 mt-1">
                        Gestiona el directorio de socios. Estos se mostrarán en la sección pública de tu sitio web.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={addMember}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all">
                        <Plus className="w-4 h-4" /> Agregar miembro
                    </button>
                    <button onClick={saveMembers} disabled={saving}
                        className="flex items-center gap-2 px-5 py-2.5 bg-[#019fcb] text-white rounded-xl text-sm font-bold hover:bg-[#017da3] transition-all disabled:opacity-50 shadow-lg shadow-blue-900/10">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                        Guardar cambios
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Miembros</p>
                    <p className="text-3xl font-black text-gray-900 mt-1">{members.length}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Directivos</p>
                    <p className="text-3xl font-black text-[#019fcb] mt-1">{boardMembers.length}</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Por completar</p>
                    <p className="text-3xl font-black text-amber-500 mt-1">{members.filter(m => !m.name || !m.image).length}</p>
                </div>
            </div>

            {/* Members Grid */}
            {members.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                    <Users className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-gray-400 mb-2">Sin miembros registrados</h3>
                    <p className="text-sm text-gray-300 mb-6">Agrega los socios de tu club para que aparezcan en el sitio web público.</p>
                    <button onClick={addMember}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#019fcb] text-white rounded-xl text-sm font-bold hover:bg-[#017da3] transition-all">
                        <Plus className="w-4 h-4" /> Agregar primer miembro
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {members.map((member, index) => (
                        <MemberCard
                            key={member.id}
                            member={member}
                            index={index}
                            onUpdate={updateMember}
                            onRemove={removeMember}
                            onImageUpload={handleImageUpload}
                        />
                    ))}

                    {/* Add member card */}
                    <button onClick={addMember}
                        className="border-2 border-dashed border-gray-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 hover:border-[#019fcb] hover:bg-blue-50/30 transition-all group min-h-[200px]">
                        <Plus className="w-8 h-8 text-gray-300 group-hover:text-[#019fcb] transition-colors" />
                        <span className="text-sm font-bold text-gray-400 group-hover:text-[#019fcb]">Agregar miembro</span>
                    </button>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-8 right-8 z-50 animate-fade-in">
                    <div className="flex items-center gap-3 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-2xl">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <p className="text-sm font-bold">{toast}</p>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Member Card Component ──
const MemberCard: React.FC<{
    member: Member;
    index: number;
    onUpdate: (i: number, field: keyof Member, value: any) => void;
    onRemove: (i: number) => void;
    onImageUpload: (i: number, file: File) => void;
}> = ({ member, index, onUpdate, onRemove, onImageUpload }) => {
    const fileRef = useRef<HTMLInputElement>(null);

    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4 hover:shadow-md transition-all group relative">
            {/* Remove button */}
            <button onClick={() => onRemove(index)}
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all p-1">
                <Trash2 className="w-4 h-4" />
            </button>

            {/* Photo + Name */}
            <div className="flex items-center gap-4">
                <div onClick={() => fileRef.current?.click()}
                    className="w-16 h-16 rounded-full border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-[#019fcb] overflow-hidden bg-gray-50 flex-shrink-0 transition-all">
                    {member.image ? (
                        <img src={member.image} alt={member.name} className="w-full h-full object-cover" />
                    ) : (
                        <Camera className="w-5 h-5 text-gray-300" />
                    )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={e => e.target.files?.[0] && onImageUpload(index, e.target.files[0])} />
                <div className="flex-1 min-w-0">
                    <input value={member.name} onChange={e => onUpdate(index, 'name', e.target.value)}
                        className="w-full bg-transparent border-0 border-b border-gray-100 pb-1 text-sm font-bold text-gray-900 focus:outline-none focus:border-[#019fcb] transition-all placeholder:text-gray-300"
                        placeholder="Nombre completo" />
                </div>
            </div>

            {/* Description */}
            <textarea value={member.description} onChange={e => onUpdate(index, 'description', e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#019fcb]/20 resize-none transition-all"
                rows={2} placeholder="Cargo o descripción breve..." />

            {/* Board toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={member.isBoard}
                        onChange={e => onUpdate(index, 'isBoard', e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-[#019fcb] focus:ring-[#019fcb]" />
                    <span className="text-xs font-bold text-gray-500">Directivo</span>
                </label>
                {member.isBoard && (
                    <input value={member.boardRole} onChange={e => onUpdate(index, 'boardRole', e.target.value)}
                        className="bg-blue-50 border border-blue-100 rounded-lg px-2 py-1 text-[10px] font-bold text-[#019fcb] w-28 focus:outline-none"
                        placeholder="Presidente..." />
                )}
            </div>
        </div>
    );
};

export default MembersPage;
