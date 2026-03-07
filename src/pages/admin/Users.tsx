import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Plus, Edit2, Trash2, Search, User, X, Mail, Shield,
    Home, Lock, Key
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';

interface UserData {
    id: string;
    email: string;
    role: string;
    clubId?: string;
    club?: { name: string };
    createdAt: string;
}

const UsersManagement: React.FC = () => {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<UserData[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<UserData | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [clubs, setClubs] = useState<{ id: string, name: string }[]>([]);

    const [formData, setFormData] = useState({
        email: '',
        password: '',
        role: 'club_admin',
        clubId: '',
    });

    useEffect(() => {
        fetchUsers();
        if (currentUser?.role === 'administrator') {
            fetchClubs();
        }
    }, [currentUser]);

    const fetchUsers = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/users`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setUsers(data);
            }
        } catch (error) {
            toast.error('Error al cargar usuarios');
        }
    };

    const fetchClubs = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/clubs`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setClubs(data);
            }
        } catch (error) {
            console.error('Clubs error:', error);
        }
    };

    const handleOpenModal = (user?: UserData) => {
        if (user) {
            setEditingUser(user);
            setFormData({
                email: user.email,
                password: '',
                role: user.role,
                clubId: user.clubId || '',
            });
        } else {
            setEditingUser(null);
            setFormData({
                email: '',
                password: '',
                role: currentUser?.role === 'administrator' ? 'club_admin' : 'member',
                clubId: currentUser?.clubId || '',
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const url = editingUser
                ? `${apiUrl}/admin/users/${editingUser.id}`
                : `${apiUrl}/admin/users`;

            const response = await fetch(url, {
                method: editingUser ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                toast.success(editingUser ? 'Usuario actualizado' : 'Usuario creado');
                setIsModalOpen(false);
                fetchUsers();
            } else {
                const data = await response.json();
                toast.error(data.error || 'Error al procesar la solicitud');
            }
        } catch (error: any) {
            toast.error('Error al conectar con el servidor');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (user: UserData) => {
        if (user.id === currentUser?.id) {
            toast.error('No puedes eliminarte a ti mismo');
            return;
        }

        if (!window.confirm(`¿Eliminar al usuario ${user.email}?`)) return;

        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/users/${user.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                toast.success('Usuario eliminado');
                fetchUsers();
            }
        } catch (error) {
            toast.error('No se pudo eliminar');
        }
    };

    const filteredUsers = users.filter(u =>
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.club?.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Gestión de Usuarios</h1>
                    <p className="text-gray-500 text-sm">Administra quiénes tienen acceso al panel {currentUser?.role !== 'administrator' && `de ${currentUser?.club?.name}`}.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 bg-rotary-blue text-white px-4 py-2 rounded-lg hover:bg-sky-800 transition-all font-bold shadow-lg shadow-rotary-blue/20"
                >
                    <Plus className="w-5 h-5" /> Nuevo Usuario
                </button>
            </div>

            <div className="mb-6 flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar por email, rol o club..."
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rotary-blue/20 transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left min-w-[600px]">
                    <thead className="bg-gray-50/50 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Usuario</th>
                            <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Rol</th>
                            <th className="px-6 py-4 text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Club Asignado</th>
                            <th className="px-6 py-4 text-right text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredUsers.map((u) => (
                            <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-sky-50 flex items-center justify-center text-rotary-blue border border-sky-100">
                                            <User className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm">{u.email}</p>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">ID: {u.id.split('-')[0]}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase ${u.role === 'administrator' ? 'bg-red-50 text-red-600 border border-red-100' :
                                        u.role === 'club_admin' ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                                            'bg-gray-100 text-gray-600 border border-gray-200'
                                        }`}>
                                        {u.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-2 text-sm text-gray-600 font-medium">
                                        <Home className="w-4 h-4 text-gray-300" />
                                        {u.club ? u.club.name : (u.role === 'administrator' ? 'Súper Administrador (Global)' : 'Sin Club')}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => handleOpenModal(u)} className="p-2 text-gray-400 hover:text-rotary-blue hover:bg-sky-50 rounded-lg transition-all">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        {u.id !== currentUser?.id && (
                                            <button onClick={() => handleDelete(u)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in duration-200">
                        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h2 className="text-xl font-bold text-gray-800">
                                    {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
                                </h2>
                                <p className="text-xs text-gray-400 font-medium">Asigna roles y accesos a la plataforma.</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white rounded-full text-gray-400 transition-colors shadow-sm">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-8 space-y-6">
                            <div className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                        <Mail className="w-4 h-4" /> Email del Usuario
                                    </label>
                                    <input
                                        type="email" required
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none transition-all font-medium"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        placeholder="ejemplo@rotary.org"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                        <Lock className="w-4 h-4" /> {editingUser ? 'Cambiar Contraseña (opcional)' : 'Contraseña Inicial'}
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="password"
                                            required={!editingUser}
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none transition-all font-medium"
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            placeholder="••••••••"
                                        />
                                        <Key className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                            <Shield className="w-4 h-4" /> Rol de Acceso
                                        </label>
                                        <select
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none appearance-none bg-white font-medium text-sm"
                                            value={formData.role}
                                            onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                            disabled={currentUser?.role !== 'administrator'}
                                        >
                                            {currentUser?.role === 'administrator' && <option value="administrator">Súper Admin</option>}
                                            <option value="club_admin">Admin de Club</option>
                                            <option value="member">Miembro / Editor</option>
                                        </select>
                                    </div>

                                    {currentUser?.role === 'administrator' && (
                                        <div className="space-y-1">
                                            <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                                <Home className="w-4 h-4" /> Club
                                            </label>
                                            <select
                                                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none appearance-none bg-white font-medium text-sm"
                                                value={formData.clubId}
                                                onChange={(e) => setFormData({ ...formData, clubId: e.target.value })}
                                                required={formData.role !== 'administrator'}
                                            >
                                                <option value="">-- Sin Club --</option>
                                                {clubs.map(c => (
                                                    <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="pt-4 flex flex-col gap-3">
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full bg-rotary-blue text-white px-8 py-3.5 rounded-2xl font-bold hover:bg-sky-800 transition-all shadow-xl shadow-rotary-blue/20 disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Guardando...' : (editingUser ? 'Guardar Cambios' : 'Crear Usuario')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="w-full px-6 py-2.5 text-gray-400 font-bold hover:text-gray-600 transition-colors"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default UsersManagement;
