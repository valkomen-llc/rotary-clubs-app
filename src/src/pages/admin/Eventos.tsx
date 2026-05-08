import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { 
    Plus, Edit2, Trash2, Globe, MapPin, X, LogIn, 
    MessageSquare, Mail, FileText, Download, RefreshCw, Send, AlertTriangle, 
    Shield, Calendar, CreditCard, Building2 
} from 'lucide-react';
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
    expirationBannerActive?: boolean;
    expirationBannerMessage?: string | null;
    developmentBannerActive?: boolean;
    developmentBannerMessage?: string | null;
    _count?: {
        users: number;
        projects: number;
        posts: number;
    };
    subscriptionStatus?: string;
    expirationDate?: string | null;
    billingContactEmail?: string | null;
    billingContactPhone?: string | null;
    type?: string;
    district?: string | null;
}

const EventosManagement: React.FC = () => {
    const [associations, setAssociations] = useState<Club[]>([]);
    const [superUsers, setSuperUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingClub, setEditingClub] = useState<Club | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { impersonate } = useAuth();
    
    // Notification Center State
    const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
    const [selectedClubForNotify, setSelectedClubForNotify] = useState<Club | null>(null);
    const [notifyMethod, setNotifyMethod] = useState<'whatsapp' | 'email'>('whatsapp');
    const [notifyContent, setNotifyContent] = useState('');
    const [isSendingNotify, setIsSendingNotify] = useState(false);

    const [formData, setFormData] = useState({
        name: '',
        city: '',
        country: '',
        domain: '',
        subdomain: '',
        description: '',
        status: 'active',
        type: 'Evento o Convención',
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
        expirationBannerActive: false,
        expirationBannerMessage: '',
        developmentBannerActive: false,
        developmentBannerMessage: '',
        subscriptionStatus: 'active',
        expirationDate: '',
        billingContactEmail: '',
        billingContactPhone: '',
        district: '',
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
                fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/clubs?type=Evento%20o%20Convenci%C3%B3n`, { headers: { 'Authorization': `Bearer ${token}` } }),
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
                type: club.type || 'association',
                adminUserId: '',
                moduleProjects: true, moduleEvents: true, moduleRotaract: false, moduleInteract: false,
                moduleEcommerce: false, moduleDian: false, moduleYouthExchange: false, moduleNgse: false, moduleRotex: false,
                expirationBannerActive: (club as any).expirationBannerActive || false,
                expirationBannerMessage: (club as any).expirationBannerMessage || '',
                developmentBannerActive: (club as any).developmentBannerActive || false,
                developmentBannerMessage: (club as any).developmentBannerMessage || '',
                subscriptionStatus: club.subscriptionStatus || 'active',
                expirationDate: club.expirationDate ? new Date(club.expirationDate).toISOString().split('T')[0] : '',
                billingContactEmail: club.billingContactEmail || '',
                billingContactPhone: club.billingContactPhone || '',
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
                        expirationBannerActive: fullData.expirationBannerActive || false,
                        expirationBannerMessage: fullData.expirationBannerMessage || '',
                        developmentBannerActive: fullData.developmentBannerActive || false,
                        developmentBannerMessage: fullData.developmentBannerMessage || '',
                        subscriptionStatus: fullData.subscriptionStatus || 'active',
                        expirationDate: fullData.expirationDate ? new Date(fullData.expirationDate).toISOString().split('T')[0] : '',
                        billingContactEmail: fullData.billingContactEmail || '',
                        billingContactPhone: fullData.billingContactPhone || '',
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
                type: 'Evento o Convención',
                adminUserId: '',
                moduleProjects: true, moduleEvents: true, moduleRotaract: false, moduleInteract: false,
                moduleEcommerce: false, moduleDian: false, moduleYouthExchange: false, moduleNgse: false, moduleRotex: false,
                expirationBannerActive: false,
                expirationBannerMessage: '',
                developmentBannerActive: false,
                developmentBannerMessage: '',
                subscriptionStatus: 'active',
                expirationDate: '',
                billingContactEmail: '',
                billingContactPhone: '',
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
            const formDataWithType = { ...formData, subdomain: finalSubdomain };

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

    const exportToCSV = () => {
        const headers = ['Nombre', 'Ciudad', 'Pais', 'Email Billing', 'Telefono Billing', 'Estado SaaS', 'Vencimiento', 'Dominio', 'Subdominio'];
        const rows = associations.map(c => [
            c.name,
            c.city,
            c.country,
            c.billingContactEmail || 'N/A',
            c.billingContactPhone || 'N/A',
            c.subscriptionStatus || 'active',
            c.expirationDate ? new Date(c.expirationDate).toLocaleDateString() : 'N/A',
            c.domain || 'N/A',
            c.subdomain || 'N/A'
        ]);

        const csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n" 
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `asociaciones_rotary_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSendNotification = async () => {
        if (!selectedClubForNotify || !notifyContent) return;
        setIsSendingNotify(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/communications/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    clubId: selectedClubForNotify.id,
                    type: notifyMethod,
                    content: notifyContent,
                    recipient: notifyMethod === 'whatsapp' ? selectedClubForNotify.billingContactPhone : selectedClubForNotify.billingContactEmail,
                    subject: notifyMethod === 'email' ? `Aviso de suscripción: ${selectedClubForNotify.name}` : undefined
                })
            });

            if (response.ok) {
                toast.success('Notificación enviada correctamente');
                setIsNotificationModalOpen(false);
                setNotifyContent('');
            } else {
                const data = await response.json();
                throw new Error(data.error || 'Error al enviar notificación');
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsSendingNotify(false);
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
                    <h1 className="text-2xl font-bold text-gray-800">Gestión de Eventos y Convenciones</h1>
                    <p className="text-gray-500 text-sm">Administra redes multidistritales, EMAR, fondos y asociaciones.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={exportToCSV}
                        className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors"
                    >
                        Descargar CSV
                    </button>
                    <button
                        onClick={() => handleOpenModal()}
                        className="flex items-center gap-2 bg-rotary-blue text-white px-4 py-2 rounded-lg hover:bg-sky-800 transition-colors"
                    >
                        <Plus className="w-4 h-4" /> Nuevo Evento
                    </button>
                </div>
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
                                            onClick={() => {
                                                setSelectedClubForNotify(club);
                                                setNotifyContent(`Estimado equipo de ${club.name}, le informamos que su suscripción a la plataforma se encuentra en estado: ${club.subscriptionStatus}. Por favor contacte con administración.`);
                                                setIsNotificationModalOpen(true);
                                            }}
                                            className="p-2 text-gray-400 hover:text-[#019fcb] transition-colors"
                                            title="Enviar notificación SaaS"
                                        >
                                            <LogIn className="w-4 h-4 rotate-90" />
                                        </button>
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
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 flex-shrink-0">
                            <h2 className="text-lg font-bold text-gray-800">
                                {editingClub ? 'Editar Asociación' : 'Nuevo Evento'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-200">
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
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Subdominio de Plataforma (Opcional)</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all"
                                        value={formData.subdomain || ''}
                                        onChange={(e) => setFormData({ ...formData, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                                        placeholder="ej: latir"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1">Este será el prefijo que usará la plataforma si no configuras un Dominio Propio (ej: tunombre.clubplatform.org).</p>
                                </div>

                                <div>
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

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Skin de Arquitectura (Footer)</label>
                                    <select
                                        className="w-full px-4 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all bg-sky-50 font-bold text-rotary-blue"
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                        title="Define la estructura de links y labels del footer"
                                    >
                                        <option value="association">Skin de Asociación / Agrupación</option>
                                        <option value="club">Skin de Rotary Club (Socio)</option>
                                        <option value="district">Skin de Distrito Rotary</option>
                                        <option value="colrotarios">Skin de Colrotarios (Fundación)</option>
                                    </select>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Usuario Administrador (Opcional)</label>
                                    <select
                                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none text-sm bg-white"
                                        value={formData.adminUserId}
                                        onChange={(e) => setFormData({ ...formData, adminUserId: e.target.value })}
                                    >
                                        <option value="">-- Seleccionar Administrador --</option>
                                        {superUsers.map(u => (
                                            <option key={u.id} value={u.id}>{u.email} ({u.role})</option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-gray-400 mt-1">Si seleccionas un administrador, sobreescribirá la asignación anterior. Los administradores también pueden ajustarse en la sección de Gestión de Distritos.</p>
                                </div>
                            </div>

                            {/* ADMINISTRATIVE SUPERVISION */}
                            <div className="mt-8 pt-6 border-t border-red-100 bg-red-50/30 p-4 rounded-xl">
                                <h3 className="text-sm font-bold text-red-900 mb-4 flex items-center gap-2">
                                    🚨 Supervisión Administrativa
                                </h3>
                                <div className="space-y-4">
                                    <label className="flex items-center gap-3 cursor-pointer p-3 border border-red-100 rounded-xl bg-white hover:bg-red-50 transition-colors">
                                        <input 
                                            type="checkbox" 
                                            className="w-4 h-4 text-red-600 rounded border-gray-300 focus:ring-red-500" 
                                            checked={formData.expirationBannerActive} 
                                            onChange={(e) => setFormData({ ...formData, expirationBannerActive: e.target.checked })} 
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-[13px] font-bold text-red-700">Activar Banner de Vencimiento</span>
                                            <span className="text-[10px] text-red-500">Muestra una alerta global sobre el vencimiento del servicio.</span>
                                        </div>
                                    </label>
                                    
                                    {formData.expirationBannerActive && (
                                        <div className="animate-in slide-in-from-top-2 duration-200">
                                            <label className="block text-[11px] font-bold text-red-700 mb-1 uppercase tracking-wider">Mensaje de Advertencia (Profesional)</label>
                                            <textarea
                                                className="w-full px-4 py-2 border border-red-200 rounded-lg focus:ring-2 focus:ring-red-500 outline-none transition-all text-sm bg-white h-20"
                                                value={formData.expirationBannerMessage}
                                                onChange={(e) => setFormData({ ...formData, expirationBannerMessage: e.target.value })}
                                                placeholder="Ej: Este sitio web se encuentra en periodo de renovación. Por favor contacte a soporte para evitar la suspensión del servicio."
                                            />
                                            <p className="text-[10px] text-red-400 mt-1 italic">Si se deja vacío, se usará un mensaje profesional por defecto.</p>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-4 mt-6 pt-6 border-t border-red-100">
                                    <label className="flex items-center gap-3 cursor-pointer p-3 border border-yellow-200 rounded-xl bg-white hover:bg-yellow-50 transition-colors">
                                        <input 
                                            type="checkbox" 
                                            className="w-4 h-4 text-yellow-600 rounded border-gray-300 focus:ring-yellow-500" 
                                            checked={formData.developmentBannerActive} 
                                            onChange={(e) => setFormData({ ...formData, developmentBannerActive: e.target.checked })} 
                                        />
                                        <div className="flex flex-col">
                                            <span className="text-[13px] font-bold text-yellow-700">Activar Banner de Desarrollo</span>
                                            <span className="text-[10px] text-yellow-600">Muestra una alerta indicando que el sitio está en construcción.</span>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* SAAS & BILLING SECTION */}
                            <div className="mt-8 pt-6 border-t border-blue-100 bg-blue-50/20 p-4 rounded-xl">
                                <h3 className="text-sm font-bold text-rotary-blue mb-4 flex items-center gap-2">
                                    💳 Gestión SaaS y Facturación
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-600 mb-1 uppercase tracking-wider">Estado de Suscripción</label>
                                        <select
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all text-sm"
                                            value={formData.subscriptionStatus}
                                            onChange={(e) => setFormData({ ...formData, subscriptionStatus: e.target.value })}
                                        >
                                            <option value="active">Activo (Full Access)</option>
                                            <option value="expired">Vencido (Modo Lectura)</option>
                                            <option value="trial">Prueba Gratuita</option>
                                            <option value="suspended">Suspendido</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-600 mb-1 uppercase tracking-wider">Fecha de Vencimiento</label>
                                        <input
                                            type="date"
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all text-sm"
                                            value={formData.expirationDate || ''}
                                            onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-600 mb-1 uppercase tracking-wider">Email de Facturación</label>
                                        <input
                                            type="email"
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all text-sm"
                                            value={formData.billingContactEmail || ''}
                                            onChange={(e) => setFormData({ ...formData, billingContactEmail: e.target.value })}
                                            placeholder="tesoreria@club.org"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-600 mb-1 uppercase tracking-wider">Teléfono de Facturación (WhatsApp)</label>
                                        <input
                                            type="tel"
                                            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all text-sm"
                                            value={formData.billingContactPhone || ''}
                                            onChange={(e) => setFormData({ ...formData, billingContactPhone: e.target.value })}
                                            placeholder="+57310..."
                                        />
                                    </div>
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

            {/* Notification Modal */}
            {isNotificationModalOpen && selectedClubForNotify && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in duration-200">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <div>
                                <h2 className="text-lg font-black text-gray-800">Comunicar con {selectedClubForNotify.name}</h2>
                                <p className="text-xs text-gray-400">Canal directo de administración SaaS</p>
                            </div>
                            <button onClick={() => setIsNotificationModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="flex gap-2 p-1 bg-gray-100 rounded-xl">
                                <button 
                                    onClick={() => setNotifyMethod('whatsapp')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm transition-all ${notifyMethod === 'whatsapp' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    WhatsApp
                                </button>
                                <button 
                                    onClick={() => setNotifyMethod('email')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-sm transition-all ${notifyMethod === 'email' ? 'bg-white text-rotary-blue shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Email
                                </button>
                            </div>

                            <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700 border border-blue-100">
                                <strong>Destinatario:</strong> {notifyMethod === 'whatsapp' ? (selectedClubForNotify.billingContactPhone || 'Sin teléfono') : (selectedClubForNotify.billingContactEmail || 'Sin email')}
                            </div>

                            <div>
                                <label className="block text-[11px] font-black text-gray-500 mb-1 uppercase tracking-wider">Mensaje Personalizado</label>
                                <textarea
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue outline-none transition-all text-sm h-32 resize-none"
                                    value={notifyContent}
                                    onChange={(e) => setNotifyContent(e.target.value)}
                                    placeholder="Escriba el mensaje aquí..."
                                />
                            </div>

                            <button
                                onClick={handleSendNotification}
                                disabled={isSendingNotify || (notifyMethod === 'whatsapp' && !selectedClubForNotify.billingContactPhone) || (notifyMethod === 'email' && !selectedClubForNotify.billingContactEmail)}
                                className="w-full bg-[#019fcb] text-white py-3 rounded-xl font-bold hover:bg-sky-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isSendingNotify ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                {isSendingNotify ? 'Enviando...' : 'Enviar Notificación Ahora'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default EventosManagement;
