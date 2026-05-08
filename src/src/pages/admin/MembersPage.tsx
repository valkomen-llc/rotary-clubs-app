import React, { useState, useEffect, useRef } from 'react';
import { 
    Users, Plus, Loader2, Camera, ShieldCheck, Trash2, 
    UserCheck, AlertCircle, Save, UserPlus, Search, 
    Filter, MoreVertical, X, CheckCircle2, ArrowUp, ArrowDown, GripVertical
} from 'lucide-react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAuth } from '../../hooks/useAuth';
import { useClub } from '../../contexts/ClubContext';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

interface Member {
    id: string;
    name: string;
    image: string;
    description: string;
    isBoard: boolean;
    boardRole: string;
    position: number;
}

const MembersPage: React.FC = () => {
    const { user } = useAuth();
    const { club } = useClub();
    const token = localStorage.getItem('rotary_token');
    const clubId = club?.id || user?.clubId;

    const [members, setMembers] = useState<Member[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filter, setFilter] = useState<'all' | 'board'>('all');

    // ── Fetch members ──
    useEffect(() => {
        if (!clubId) return;
        setLoading(true);
        fetch(`${API}/admin/clubs/${clubId}`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => {
                if (d.members) {
                    setMembers(d.members.map((m: any) => ({
                        id: m.id || Date.now().toString() + Math.random(), 
                        name: m.name || '', 
                        image: m.image || '', 
                        description: m.description || '',
                        isBoard: m.isBoard || false, 
                        boardRole: m.boardRole || '',
                        position: m.position || 0
                    })));
                }
            })
            .catch(() => toast.error('Error al cargar miembros'))
            .finally(() => setLoading(false));
    }, [clubId]);

    const addMember = () => {
        const newMember = {
            id: 'temp-' + Date.now(), 
            name: '', 
            image: '', 
            description: '', 
            isBoard: false, 
            boardRole: '',
            position: members.length > 0 ? members[0].position - 1 : 0
        };
        setMembers(prev => [newMember, ...prev]);
        toast.info('Nuevo socio añadido al inicio de la lista');
    };

    const updateMember = (index: number, field: keyof Member, value: any) => {
        setMembers(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const moveMember = (index: number, direction: 'up' | 'down') => {
        setMembers(prev => {
            const next = [...prev];
            const targetIndex = direction === 'up' ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= next.length) return prev;
            
            // Swap
            const [moved] = next.splice(index, 1);
            next.splice(targetIndex, 0, moved);
            return next;
        });
    };

    const handleDragStart = (e: React.DragEvent, index: number) => {
        e.dataTransfer.setData('draggedIndex', index.toString());
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        const draggedIndex = parseInt(e.dataTransfer.getData('draggedIndex'));
        if (draggedIndex === targetIndex) return;

        setMembers(prev => {
            const next = [...prev];
            const [moved] = next.splice(draggedIndex, 1);
            next.splice(targetIndex, 0, moved);
            return next;
        });
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const removeMember = (index: number) => {
        setMembers(prev => prev.filter((_, i) => i !== index));
        toast.success('Socio removido de la lista local');
    };

    const handleImageUpload = async (index: number, file: File) => {
        const fd = new FormData();
        fd.append('file', file);
        const loadingToast = toast.loading('Subiendo imagen...');
        try {
            const res = await fetch(`${API}/media/upload`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: fd,
            });
            const data = await res.json();
            const url = data.url || data.secure_url || '';
            if (url) {
                updateMember(index, 'image', url);
                toast.success('Imagen actualizada', { id: loadingToast });
            } else {
                toast.error('No se pudo obtener la URL de la imagen', { id: loadingToast });
            }
        } catch { 
            toast.error('Error en la subida', { id: loadingToast });
        }
    };

    const saveMembers = async () => {
        if (!clubId) return;
        
        // Update positions based on current array order before saving
        const membersToSave = members.map((m, i) => ({ ...m, position: i }));
        const validMembers = membersToSave.filter(m => m.name.trim() !== '');
        
        if (validMembers.length === 0 && members.length > 0) {
            toast.warning('Debes asignar al menos un nombre para guardar');
            return;
        }

        setSaving(true);
        const saveToast = toast.loading('Guardando cambios en el servidor...');
        try {
            const res = await fetch(`${API}/admin/clubs/${clubId}/members/batch`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ members: validMembers }),
            });
            if (res.ok) {
                toast.success('¡Directorio actualizado con éxito!', { id: saveToast });
            } else {
                toast.error('Error al sincronizar con el servidor', { id: saveToast });
            }
        } catch { 
            toast.error('Error de conexión', { id: saveToast });
        }
        setSaving(false);
    };

    const filteredMembers = members.filter(m => {
        const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             m.description.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = filter === 'all' || m.isBoard;
        return matchesSearch && matchesFilter;
    });

    const boardMembersCount = members.filter(m => m.isBoard).length;
    const incompleteCount = members.filter(m => !m.name || !m.image).length;

    if (loading) {
        return (
            <AdminLayout>
                <div className="flex flex-col items-center justify-center h-[60vh]">
                    <Loader2 className="w-10 h-10 animate-spin text-rotary-blue mb-4" />
                    <p className="text-gray-400 font-medium animate-pulse">Cargando directorio de socios...</p>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="max-w-6xl mx-auto space-y-8">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
                            <Users className="w-7 h-7 text-white" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-gray-900 tracking-tight">Miembros del Club</h1>
                            <p className="text-sm text-gray-400 font-medium mt-1">
                                Gestiona el directorio público de socios y junta directiva.
                            </p>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        <button onClick={addMember}
                            className="group flex items-center gap-2 px-5 py-3 bg-white border border-gray-100 text-gray-700 rounded-2xl text-sm font-bold hover:bg-gray-50 hover:border-gray-200 transition-all shadow-sm">
                            <UserPlus className="w-4 h-4 text-sky-500 group-hover:scale-110 transition-transform" /> 
                            Agregar Socio
                        </button>
                        <button onClick={saveMembers} disabled={saving}
                            className="flex items-center gap-2 px-6 py-3 bg-rotary-blue text-white rounded-2xl text-sm font-black hover:bg-sky-800 transition-all disabled:opacity-50 shadow-xl shadow-blue-900/20 active:scale-95">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Guardar Directorio
                        </button>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    {[
                        { label: 'Total Miembros', value: members.length, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
                        { label: 'Junta Directiva', value: boardMembersCount, icon: UserCheck, color: 'text-violet-600', bg: 'bg-violet-50' },
                        { label: 'Por completar', value: incompleteCount, icon: AlertCircle, color: incompleteCount > 0 ? 'text-amber-500' : 'text-emerald-500', bg: incompleteCount > 0 ? 'bg-amber-50' : 'bg-emerald-50' },
                    ].map((stat, i) => (
                        <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 flex items-center gap-4 shadow-sm hover:shadow-md transition-all">
                            <div className={`w-12 h-12 rounded-xl ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                                <stat.icon className={`w-6 h-6 ${stat.color}`} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1.5">{stat.label}</p>
                                <p className="text-2xl font-black text-gray-900 tracking-tight">{stat.value}</p>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                    <div className="relative w-full sm:w-96">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                        <input 
                            type="text" 
                            placeholder="Buscar por nombre o cargo..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-transparent rounded-xl text-sm focus:bg-white focus:border-sky-500 outline-none transition-all"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-300 mr-1" />
                        <button 
                            onClick={() => setFilter('all')}
                            className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all ${filter === 'all' ? 'bg-gray-900 text-white shadow-lg shadow-gray-200' : 'text-gray-400 hover:bg-gray-50'}`}>
                            TODOS
                        </button>
                        <button 
                            onClick={() => setFilter('board')}
                            className={`px-4 py-2 rounded-xl text-[11px] font-black transition-all ${filter === 'board' ? 'bg-sky-500 text-white shadow-lg shadow-sky-100' : 'text-gray-400 hover:bg-gray-50'}`}>
                            DIRECTIVOS
                        </button>
                    </div>
                </div>

                {/* Members Grid */}
                {filteredMembers.length === 0 ? (
                    <div className="bg-white rounded-3xl border border-gray-100 p-16 text-center shadow-sm">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                            <Users className="w-10 h-10 text-gray-200" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">No se encontraron miembros</h3>
                        <p className="text-gray-400 max-w-sm mx-auto mb-8">
                            {searchQuery ? 'Prueba con otro término de búsqueda o ajusta los filtros.' : 'Comienza a construir el directorio de tu club agregando al primer socio.'}
                        </p>
                        {!searchQuery && (
                            <button onClick={addMember}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-rotary-blue text-white rounded-2xl text-sm font-black hover:bg-sky-800 transition-all shadow-xl shadow-blue-900/10 active:scale-95">
                                <Plus className="w-4 h-4" /> Agregar primer miembro
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-12">
                        {filteredMembers.map((member) => {
                            // Find real index in the original members array
                            const originalIndex = members.findIndex(m => m.id === member.id);
                            return (
                                <MemberCard
                                    key={member.id}
                                    member={member}
                                    index={originalIndex}
                                    onUpdate={updateMember}
                                    onRemove={removeMember}
                                    onMove={moveMember}
                                    onImageUpload={handleImageUpload}
                                    isFirst={originalIndex === 0}
                                    isLast={originalIndex === members.length - 1}
                                    onDragStart={(e) => handleDragStart(e, originalIndex)}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, originalIndex)}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </AdminLayout>
    );
};

// ── Member Card Component ──
const MemberCard: React.FC<{
    member: Member;
    index: number;
    onUpdate: (i: number, field: keyof Member, value: any) => void;
    onRemove: (i: number) => void;
    onMove: (i: number, dir: 'up' | 'down') => void;
    onImageUpload: (i: number, file: File) => void;
    isFirst: boolean;
    isLast: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
}> = ({ member, index, onUpdate, onRemove, onMove, onImageUpload, isFirst, isLast, onDragStart, onDragOver, onDrop }) => {
    const fileRef = useRef<HTMLInputElement>(null);
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div 
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            draggable
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            className={`group bg-white rounded-[2rem] border transition-all duration-300 p-6 flex flex-col gap-5 ${isHovered ? 'border-sky-200 shadow-xl shadow-sky-500/5 -translate-y-1' : 'border-gray-100 shadow-sm'} cursor-default active:cursor-grabbing`}>
            
            <div className="flex items-start justify-between">
                {/* Profile Image with Camera Overlay */}
                <div className="flex items-center gap-4">
                    <div className="cursor-grab active:cursor-grabbing p-1 -ml-2 text-gray-300 hover:text-sky-400 transition-colors opacity-0 group-hover:opacity-100">
                        <GripVertical className="w-5 h-5" />
                    </div>
                    
                    <div className="relative">
                        <div onClick={() => fileRef.current?.click()}
                            className={`w-20 h-20 rounded-2xl border-2 overflow-hidden cursor-pointer transition-all ${member.image ? 'border-sky-100' : 'border-dashed border-gray-200 bg-gray-50'}`}>
                            {member.image ? (
                                <img src={member.image} alt={member.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 px-2">
                                    <Camera className="w-5 h-5 text-gray-300" />
                                    <span className="text-[9px] font-black text-gray-400 uppercase text-center leading-tight">Subir Foto</span>
                                </div>
                            )}
                            
                            {/* Hover Overlay */}
                            <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity rounded-2xl ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
                                <Camera className="w-6 h-6 text-white" />
                            </div>
                        </div>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden"
                            onChange={e => e.target.files?.[0] && onImageUpload(index, e.target.files[0])} />
                    </div>
                </div>

                {/* Actions Menu */}
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!isFirst && (
                        <button onClick={() => onMove(index, 'up')}
                            className="w-8 h-8 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center hover:bg-sky-500 hover:text-white transition-all shadow-sm"
                            title="Mover arriba">
                            <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {!isLast && (
                        <button onClick={() => onMove(index, 'down')}
                            className="w-8 h-8 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center hover:bg-sky-500 hover:text-white transition-all shadow-sm"
                            title="Mover abajo">
                            <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                    )}
                    <button onClick={() => onRemove(index)}
                        className="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all shadow-sm"
                        title="Eliminar">
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {/* Inputs Section */}
            <div className="space-y-4">
                <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                        Nombre del Socio {member.name && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />}
                    </label>
                    <input 
                        value={member.name} 
                        onChange={e => onUpdate(index, 'name', e.target.value)}
                        className="w-full bg-transparent border-0 border-b-2 border-gray-50 py-1.5 text-base font-bold text-gray-900 focus:outline-none focus:border-sky-500 transition-all placeholder:text-gray-300"
                        placeholder="Ej: Juan Pérez..." 
                    />
                </div>

                <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5 ml-1">
                        Cargo / Reseña Breve
                    </label>
                    <textarea 
                        value={member.description} 
                        onChange={e => onUpdate(index, 'description', e.target.value)}
                        className="w-full bg-gray-50 border border-transparent rounded-2xl px-4 py-3 text-xs text-gray-600 focus:outline-none focus:bg-white focus:border-sky-200 resize-none transition-all"
                        rows={2} 
                        placeholder="Ej: Socio Activo, ex-presidente..." 
                    />
                </div>
            </div>

            {/* Board Section */}
            <div className={`mt-2 p-3 rounded-2xl transition-all ${member.isBoard ? 'bg-sky-50 border border-sky-100' : 'bg-gray-50/50 border border-transparent'}`}>
                <div className="flex items-center justify-between">
                    <label className="flex items-center gap-3 cursor-pointer select-none">
                        <div className={`w-10 h-6 rounded-full relative transition-colors ${member.isBoard ? 'bg-sky-500' : 'bg-gray-300'}`}>
                            <input 
                                type="checkbox" 
                                checked={member.isBoard}
                                onChange={e => onUpdate(index, 'isBoard', e.target.checked)}
                                className="hidden" 
                            />
                            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm ${member.isBoard ? 'left-5' : 'left-1'}`} />
                        </div>
                        <span className={`text-[11px] font-black uppercase tracking-tight ${member.isBoard ? 'text-sky-600' : 'text-gray-400'}`}>
                            Junta Directiva
                        </span>
                    </label>
                    
                    {member.isBoard && (
                        <div className="flex items-center gap-2">
                             <input 
                                value={member.boardRole} 
                                onChange={e => onUpdate(index, 'boardRole', e.target.value)}
                                className="bg-white border border-sky-200 rounded-xl px-3 py-1.5 text-[10px] font-black text-sky-600 w-32 focus:outline-none focus:ring-2 focus:ring-sky-200 shadow-sm transition-all"
                                placeholder="Presidente..." 
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MembersPage;
