import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Plus, Edit2, Trash2, Globe, MapPin, X, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';

interface Club {
    id: string;
    name: string;
    city: string;
    country: string;
    domain: string | null;
    subdomain: string | null;
    status: string;
    description: string | null;
    _count?: {
        users: number;
        projects: number;
        posts: number;
    };
}

const AsociacionesManagement: React.FC = () => {
    const [associations, setAssociations] = useState<Club[]>([]);
    const [superUsers, setSuperUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingClub, setEditingClub] = useState<Club | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { impersonate } = useAuth();

    const [formData, setFormData] = useState({
        name: '',
        city: '',
        country: '',
        domain: '',
        subdomain: '',
        description: '',
        status: 'active',
        moduleProjects: true,
        moduleEvents: true,
        moduleRotaract: false,
        moduleInteract: false,
        moduleEcommerce: false,
        moduleDian: false,
        moduleYouthExchange: false,
        moduleNgse: false,
        moduleRotex: false,
        adminUserId: '',
    });
    const [isFetchingDetails, setIsFetchingDetails] = useState(false);

    useEffect(() => {
        fetchAssociations();
    }, []);

    const fetchAssociations = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            // Fech associations and super users in parallel
            const [assocRes, usersRes] = await Promise.all([
                fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/clubs?type=association`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/users`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (assocRes.ok) {
                const data = await assocRes.json();
                setAssociations(data);
            }
            if (usersRes.ok) {
                const usersData = await usersRes.json();
                // solo roles de admin
                setSuperUsers(usersData.filter((u: any) => u.role === 'administrator' || u.role === 'club_admin' || u.role === 'district_admin'));
            }
        } catch (error) {
            toast.error('Error al cargar asociaciones');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = async (club?: Club) => {
        setIsModalOpen(true);
        if (club) {
            setEditingClub(club);
            setFormData({
                name: club.name || '',
                city: club.city || '',
                country: club.country || '',
                domain: club.domain || '',
                subdomain: club.subdomain || '',
                description: club.description || '',
                status: club.status || 'active',
                type: 'association',
                adminUserId: '',
                moduleProjects: true, moduleEvents: true, moduleRotaract: false, moduleInteract: false,
                moduleEcommerce: false, moduleDian: false, moduleYouthExchange: false, moduleNgse: false, moduleRotex: false,
            });
            setIsFetchingDetails(true);
            try {
                const token = localStorage.getItem('rotary_token');
                const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/clubs/${club.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const fullData = await response.json();
                    const m = fullData.modules || {};
                    setFormData(prev => ({
                        ...prev,
                        moduleProjects: m.projects ?? true,
                        moduleEvents: m.events ?? true,
                        moduleRotaract: m.rotaract ?? false,
                        moduleInteract: m.interact ?? false,
                        moduleEcommerce: m.ecommerce ?? false,
                        moduleDian: m.dian ?? false,
                        moduleYouthExchange: m.youth_exchange ?? false,
                        moduleNgse: m.ngse ?? false,
                        moduleRotex: m.rotex ?? false,
                    }));
                }
            } catch (error) {
                console.error("Error fetching club details:", error);
            } finally {
                setIsFetchingDetails(false);
            }
        } else {
            setEditingClub(null);
            setFormData({
                name: '',
                city: '',
                country: '',
                domain: '',
                subdomain: '',
                description: '',
                status: 'active',
                type: 'association',
                adminUserId: '',
                moduleProjects: true, moduleEvents: true, moduleRotaract: false, moduleInteract: false,
                moduleEcommerce: false, moduleDian: false, moduleYouthExchange: false, moduleNgse: false, moduleRotex: false,
            });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const url = editingClub
                ? `${apiUrl}/admin/clubs/${editingClub.id}`
                : `${apiUrl}/admin/clubs`;

            // En Asociaciones el subdominio no es requerido, se generará pseudo-random si está vacío o se envía nulo
            const finalSubdomain = formData.subdomain || `assoc-${Date.now().toString(36)}`;
            const formDataWithType = { ...formData, type: 'association', subdomain: finalSubdomain };

            const response = await fetch(url, {
                method: editingClub ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formDataWithType)
            });

            if (response.ok) {
                toast.success(editingClub ? 'Asociación actualizada' : 'Asociación creada con éxito');
                setIsModalOpen(false);
                fetchAssociations();
            } else {
                const data = await response.json();
                throw new Error(data.error || 'Falla al procesar la solicitud');
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!window.confirm(`¿Estás seguro de eliminar la asociación "${name}"? Esta acción no se puede deshacer.`)) return;

        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/clubs/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                toast.success('Asociación eliminada');
                fetchAssociations();
            } else {
                throw new Error('No se pudo eliminar la asociación');
            }
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const handleImpersonate = async (clubId: string, clubName: string) => {
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/auth/impersonate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ targetId: clubId, type: 'club' })
            });

            if (response.ok) {
                const data = await response.json();
                toast.success(`Entrando como ${clubName}...`);
                impersonate(data.token, data.user);
            } else {
                const data = await response.json();
                throw new Error(data.error || 'No se pudo iniciar sesión en el club');
            }
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Gestión de Asociaciones y Redes (LATIR)</h1>
                    <p className="text-gray-500 text-sm">Administra redes multidistritales, EMAR, fondos y asociaciones.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 bg-rotary-blue text-white px-4 py-2 rounded-lg hover:bg-sky-800 transition-colors"
                >
                    <Plus className="w-4 h-4" /> Nueva Asociación
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Asociación</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Ubicación</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Dominios</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Stats</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {associations.map((club) => (
                            <tr key={club.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded bg-sky-100 text-rotary-blue flex items-center justify-center font-bold">
                                            {club.name ? club.name.charAt(0) : 'C'}
                                        </div>
                                        <span className="font-medium text-gray-800">{club.name}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500">
                                    <div className="flex items-center gap-1">
                                        <MapPin className="w-3 h-3" /> {club.city}, {club.country}
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-500 space-y-1">
                                    <div className="flex items-center gap-1">
                                        <Globe className="w-3 h-3 text-rotary-blue" /> {club.domain || 'N/A'}
                                    </div>
                                    <div className="text-sm text-gray-500 truncate whitespace-normal">
                                        <a href={`https://${club.subdomain || 'no-sub'}.clubplatform.org`} target="_blank" rel="noopener noreferrer" className="text-rotary-blue hover:underline">
                                            {club.subdomain || 'no-sub'}.clubplatform.org
                                        </a>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-sm">
                                    <div className="flex gap-4">
                                        <div className="text-center">
                                            <p className="text-[10px] text-gray-400 uppercase">Proyectos</p>
                                            <p className="font-bold">{club._count?.projects || 0}</p>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-[10px] text-gray-400 uppercase">Noticias</p>
                                            <p className="font-bold">{club._count?.posts || 0}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${club.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                        }`}>
                                        {club.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2">
                                        <button
                                            onClick={() => handleImpersonate(club.id, club.name)}
                                            className="p-2 text-gray-400 hover:text-green-500 transition-colors"
                                            title="Ingresar como este club"
                                        >
                                            <LogIn className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleOpenModal(club)}
                                            className="p-2 text-gray-400 hover:text-rotary-blue transition-colors"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(club.id, club.name)}
                                            className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {associations.length === 0 && !loading && (
                    <div className="p-12 text-center text-gray-400">
                        No hay asociaciones registradas actualmente.
                    </div>
                )}
            </div>

            {/* Club Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h2 className="text-lg font-bold text-gray-800">
                                {editingClub ? 'Editar Asociación' : 'Nueva Asociación'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Nombre de la Asociación</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Ej: Red LATIR"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Ciudad</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all"
                                        value={formData.city}
                                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">País</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all"
                                        value={formData.country}
                                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Distritos Asociados (Opcional)</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all"
                                        value={formData.district}
                                        onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                                        placeholder="Ej: 4271, 4281, 4290..."
                                    />
                                    <p className="text-xs text-gray-400 mt-1">Busca o agrega los distritos que pertenecen a esta asociación.</p>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Dominio Propio (Opcional)</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all"
                                        value={formData.domain}
                                        onChange={(e) => setFormData({ ...formData, domain: e.target.value.toLowerCase().replace(/https?:\/\//g, '').replace(/^www\./, '') })}
                                        placeholder="ej: rotarymiciudad.org"
                                    />
                                    {formData.domain && (
                                        <div className="mt-3 bg-emerald-50 border border-emerald-100 p-3 rounded-lg flex items-start gap-3 text-sm">
                                            <div className="text-emerald-700 mt-0.5">ℹ️</div>
                                            <div className="text-emerald-800">
                                                <p className="font-semibold mb-1">El dominio será matriculado automáticamente.</p>
                                                <p className="text-emerald-700 text-xs">Asegúrate de configurar los DNS del dominio apuntando hacia nuestro servidor:<br />
                                                    Registro <strong className="font-mono bg-white px-1">A</strong> / Alias <strong className="font-mono bg-white px-1">@</strong> / Valor: <strong className="font-mono bg-emerald-100 px-1">76.76.21.21</strong></p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Estado</label>
                                    <select
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all"
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    >
                                        <option value="active">Activo</option>
                                        <option value="inactive">Inactivo</option>
                                    </select>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Usuario Administrador (Opcional)</label>
                                    <select
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all bg-white"
                                        value={formData.adminUserId}
                                        onChange={(e) => setFormData({ ...formData, adminUserId: e.target.value })}
                                        disabled={!!editingClub} // Sólo al crear, o podríamos permitir reasignar
                                    >
                                        <option value="">-- Seleccionar Administrador --</option>
                                        {superUsers.map(u => (
                                            <option key={u.id} value={u.id}>{u.email} ({u.role})</option>
                                        ))}
                                    </select>
                                    {editingClub && <p className="text-xs text-orange-500 mt-1">El administrador original ya fue asignado. Se actualiza individualmente en el menú de "Usuarios".</p>}
                                </div>
                            </div>

                            {/* MODULES SECTION */}
                            <div className="mt-8 pt-6 border-t border-gray-100">
                                <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                                    ⚙️ Módulos y Funcionalidades
                                    {isFetchingDetails && <span className="text-[10px] text-[#019fcb] font-bold uppercase animate-pulse">Obteniendo...</span>}
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                                        <input type="checkbox" className="w-4 h-4 text-rotary-blue rounded border-gray-300 focus:ring-rotary-blue" checked={formData.moduleProjects} onChange={(e) => setFormData({ ...formData, moduleProjects: e.target.checked })} />
                                        <span className="text-[13px] font-bold text-gray-700">Proyectos</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                                        <input type="checkbox" className="w-4 h-4 text-rotary-blue rounded border-gray-300 focus:ring-rotary-blue" checked={formData.moduleEvents} onChange={(e) => setFormData({ ...formData, moduleEvents: e.target.checked })} />
                                        <span className="text-[13px] font-bold text-gray-700">Eventos</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                                        <input type="checkbox" className="w-4 h-4 text-rotary-blue rounded border-gray-300 focus:ring-rotary-blue" checked={formData.moduleEcommerce} onChange={(e) => setFormData({ ...formData, moduleEcommerce: e.target.checked })} />
                                        <span className="text-[13px] font-bold text-gray-700">Ecommerce</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                                        <input type="checkbox" className="w-4 h-4 text-rotary-blue rounded border-gray-300 focus:ring-rotary-blue" checked={formData.moduleRotaract} onChange={(e) => setFormData({ ...formData, moduleRotaract: e.target.checked })} />
                                        <span className="text-[13px] font-bold text-gray-700">Club Rotaract</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                                        <input type="checkbox" className="w-4 h-4 text-rotary-blue rounded border-gray-300 focus:ring-rotary-blue" checked={formData.moduleInteract} onChange={(e) => setFormData({ ...formData, moduleInteract: e.target.checked })} />
                                        <span className="text-[13px] font-bold text-gray-700">Club Interact</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                                        <input type="checkbox" className="w-4 h-4 text-rotary-blue rounded border-gray-300 focus:ring-rotary-blue" checked={formData.moduleYouthExchange} onChange={(e) => setFormData({ ...formData, moduleYouthExchange: e.target.checked })} />
                                        <span className="text-[13px] font-bold text-gray-700">Youth Exchange</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                                        <input type="checkbox" className="w-4 h-4 text-rotary-blue rounded border-gray-300 focus:ring-rotary-blue" checked={formData.moduleNgse} onChange={(e) => setFormData({ ...formData, moduleNgse: e.target.checked })} />
                                        <span className="text-[13px] font-bold text-gray-700">NGSE</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                                        <input type="checkbox" className="w-4 h-4 text-rotary-blue rounded border-gray-300 focus:ring-rotary-blue" checked={formData.moduleRotex} onChange={(e) => setFormData({ ...formData, moduleRotex: e.target.checked })} />
                                        <span className="text-[13px] font-bold text-gray-700">ROTEX</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                                        <input type="checkbox" className="w-4 h-4 text-rotary-blue rounded border-gray-300 focus:ring-rotary-blue" checked={formData.moduleDian} onChange={(e) => setFormData({ ...formData, moduleDian: e.target.checked })} />
                                        <span className="text-[13px] font-bold text-gray-700">Status DIAN</span>
                                    </label>
                                </div>
                            </div>

                            <div className="mt-8 flex justify-end gap-3 border-t border-gray-100 pt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-6 py-2 text-gray-500 font-bold hover:text-gray-700 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting || isFetchingDetails}
                                    className="bg-rotary-blue text-white px-8 py-2 rounded-full font-bold hover:bg-sky-800 transition-all disabled:opacity-50"
                                >
                                    {isSubmitting ? 'Guardando...' : (editingClub ? 'Guardar Cambios' : 'Crear Asociación')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default AsociacionesManagement;
