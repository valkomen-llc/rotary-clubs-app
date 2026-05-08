import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { 
    Plus, Edit2, Trash2, Globe, MapPin, X, LogIn, RefreshCw, 
    Shield, DollarSign, Users, TrendingUp, AlertTriangle, Clock,
    Download, FileSpreadsheet,
    MessageSquare, Mail, Send, Layout
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
    type: string;
    description: string | null;
    expirationBannerActive?: boolean;
    expirationBannerMessage?: string | null;
    developmentBannerActive?: boolean;
    developmentBannerMessage?: string | null;
    subscriptionStatus?: 'active' | 'inactive' | 'expired' | 'pending';
    expirationDate?: string;
    billingContactEmail?: string;
    billingContactPhone?: string;
    userCount?: number;
    _count?: {
        users: number;
        projects: number;
        posts: number;
    };
}

const ClubsManagement: React.FC = () => {
    const [clubs, setClubs] = useState<Club[]>([]);
    const [superUsers, setSuperUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingClub, setEditingClub] = useState<Club | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const { impersonate } = useAuth();
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'expired'>('all');
    const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);
    const [notifyingClub, setNotifyingClub] = useState<Club | null>(null);
    const [notificationData, setNotificationData] = useState({
        type: 'whatsapp' as 'whatsapp' | 'email',
        recipient: '',
        subject: 'Renovación de Plataforma ClubPlatform',
        content: ''
    });
    const [templates, setTemplates] = useState<any[]>([]);

    const [formData, setFormData] = useState({
        name: '',
        city: '',
        country: '',
        domain: '',
        subdomain: '',
        description: '',
        status: 'active',
        type: 'club',
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
        subscriptionStatus: 'inactive',
        expirationDate: '',
        billingContactEmail: '',
        billingContactPhone: '',
        expirationBannerActive: false,
        expirationBannerMessage: '',
        developmentBannerActive: false,
        developmentBannerMessage: '',
    });
    const [isFetchingDetails, setIsFetchingDetails] = useState(false);

    useEffect(() => {
        fetchClubs();
    }, []);

    const fetchClubs = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const [clubsRes, usersRes] = await Promise.all([
                fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/clubs?type=club`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/users`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            if (clubsRes.ok) {
                const data = await clubsRes.json();
                setClubs(data);
            }
            if (usersRes.ok) {
                const usersData = await usersRes.json();
                setSuperUsers(usersData.filter((u: any) => u.role === 'administrator' || u.role === 'club_admin' || u.role === 'district_admin'));
            }
        } catch (error) {
            toast.error('Error al cargar clubes');
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
                type: club.type || 'club',
                moduleProjects: true, moduleEvents: true, moduleRotaract: false, moduleInteract: false,
                moduleEcommerce: false, moduleDian: false, moduleYouthExchange: false,
                moduleNgse: club.moduleNgse || false,
                moduleRotex: club.moduleRotex || false,
                adminUserId: club.users?.[0]?.id || '',
                subscriptionStatus: club.subscriptionStatus || 'inactive',
                expirationDate: club.expirationDate ? new Date(club.expirationDate).toISOString().split('T')[0] : '',
                billingContactEmail: club.billingContactEmail || '',
                billingContactPhone: club.billingContactPhone || '',
                expirationBannerActive: club.expirationBannerActive || false,
                expirationBannerMessage: club.expirationBannerMessage || '',
                developmentBannerActive: club.developmentBannerActive || false,
                developmentBannerMessage: club.developmentBannerMessage || '',
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
                type: 'club',
                adminUserId: '',
                moduleProjects: true, moduleEvents: true, moduleRotaract: false, moduleInteract: false,
                moduleEcommerce: false, moduleDian: false, moduleYouthExchange: false, moduleNgse: false, moduleRotex: false,
                expirationBannerActive: false,
                expirationBannerMessage: '',
                developmentBannerActive: false,
                developmentBannerMessage: '',
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

            const response = await fetch(url, {
                method: editingClub ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                toast.success(editingClub ? 'Club actualizado' : 'Club creado con éxito');
                setIsModalOpen(false);
                fetchClubs();
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
        if (!window.confirm(`¿Estás seguro de eliminar el club "${name}"? Esta acción no se puede deshacer.`)) return;

        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/clubs/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                toast.success('Club eliminado');
                fetchClubs();
            } else {
                throw new Error('No se pudo eliminar el club');
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

    const handleOpenNotificationModal = (club: Club) => {
        setNotifyingClub(club);
        setNotificationData({
            ...notificationData,
            recipient: notificationData.type === 'email' ? (club.billingContactEmail || '') : (club.billingContactPhone || ''),
            content: `Estimados amigos de ${club.name},\n\nLes recordamos que su suscripción a la plataforma ClubPlatform para Rotary está próxima a vencer (${club.expirationDate || 'N/A'}).\n\nPueden realizar su renovación en el siguiente enlace: https://app.clubplatform.org/checkout?club=${club.subdomain}\n\nQuedamos atentos a cualquier duda.\nAtentamente,\nEquipo de Soporte Rotary.`
        });
        setIsNotificationModalOpen(true);
    };

    const handleSendNotification = async () => {
        if (!notifyingClub) return;
        if (!notificationData.recipient) {
            toast.error('El destinatario es obligatorio');
            return;
        }
        setIsSubmitting(true);

        try {
            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            
            const response = await fetch(`${apiUrl}/communications/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    type: notificationData.type,
                    recipient: notificationData.recipient,
                    subject: notificationData.subject,
                    content: notificationData.content,
                    clubId: notifyingClub.id
                })
            });

            if (response.ok) {
                toast.success('Notificación enviada con éxito');
                setIsNotificationModalOpen(false);
            } else {
                const data = await response.json();
                throw new Error(data.error || 'Error al enviar la notificación');
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleExportCSV = () => {
        const headers = ['Nombre', 'Ciudad', 'País', 'Subdominio', 'Dominio', 'Estado SaaS', 'Fecha Expiración', 'Usuarios', 'Proyectos'];
        const csvData = clubs.map(c => [
            `"${c.name}"`,
            `"${c.city || ''}"`,
            `"${c.country || ''}"`,
            `"${c.subdomain || ''}"`,
            `"${c.domain || ''}"`,
            `"${c.subscriptionStatus || 'inactive'}"`,
            `"${c.expirationDate || 'N/A'}"`,
            c.userCount || 0,
            c.projectCount || 0
        ]);

        const csvContent = [headers.join(','), ...csvData.map(row => row.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `reporte_clubes_rotary_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast.success('Reporte exportado correctamente');
    };

    // Calcular estadísticas financieras (Fase 4: Financial Oversight)
    const stats = {
        totalActive: clubs.filter(c => c.subscriptionStatus === 'active').length,
        totalProspects: clubs.filter(c => c.subscriptionStatus === 'inactive' || !c.subscriptionStatus).length,
        totalExpired: clubs.filter(c => c.subscriptionStatus === 'expired').length,
        estimatedARR: clubs.filter(c => c.subscriptionStatus === 'active').length * 299, // $299/año por club
        expiringSoon: clubs.filter(c => {
            if (!c.expirationDate || c.subscriptionStatus !== 'active') return false;
            const daysLeft = Math.ceil((new Date(c.expirationDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
            return daysLeft > 0 && daysLeft <= 30;
        }).length
    };

    return (
        <AdminLayout>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-black text-rotary-blue flex items-center gap-2">
                        <Shield className="w-6 h-6" /> Gestión Global de Clubes
                    </h1>
                    <p className="text-gray-500 text-sm">Control central de infraestructura y facturación SaaS.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-lg hover:bg-emerald-100 transition-all font-bold text-xs"
                        title="Exportar base de datos a Excel/CSV"
                    >
                        <FileSpreadsheet className="w-4 h-4" /> Exportar
                    </button>
                    <button
                        onClick={() => handleOpenModal()}
                        className="flex items-center gap-2 bg-rotary-blue text-white px-4 py-2 rounded-lg hover:bg-sky-800 transition-all shadow-lg shadow-sky-100 font-bold"
                    >
                        <Plus className="w-4 h-4" /> Nuevo Club
                    </button>
                </div>
            </div>

            {/* MÉTRICAS FINANCIERAS (Fase 4) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-emerald-50 rounded-xl">
                            <TrendingUp className="w-5 h-5 text-emerald-600" />
                        </div>
                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full uppercase">Ingresos Est.</span>
                    </div>
                    <p className="text-2xl font-black text-gray-800">${stats.estimatedARR.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wider">ARR Proyectado (USD)</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-blue-50 rounded-xl">
                            <Users className="w-5 h-5 text-blue-600" />
                        </div>
                        <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase">Suscripciones</span>
                    </div>
                    <p className="text-2xl font-black text-gray-800">{stats.totalActive}</p>
                    <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wider">Nodos activos en la red</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-amber-50 rounded-xl">
                            <Clock className="w-5 h-5 text-amber-600" />
                        </div>
                        <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase">Por Vencer</span>
                    </div>
                    <p className="text-2xl font-black text-gray-800">{stats.expiringSoon}</p>
                    <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wider">Renovaciones próximas (30d)</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-2">
                        <div className="p-2 bg-rose-50 rounded-xl">
                            <AlertTriangle className="w-5 h-5 text-rose-600" />
                        </div>
                        <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full uppercase">Inactivos</span>
                    </div>
                    <p className="text-2xl font-black text-gray-800">{stats.totalExpired + stats.totalProspects}</p>
                    <p className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-wider">Atención comercial requerida</p>
                </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-100 mb-6 flex flex-col md:flex-row gap-4 justify-between items-center shadow-sm">
                <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 w-full md:max-w-xs transition-all focus-within:ring-2 focus-within:ring-rotary-blue">
                    <Globe className="w-4 h-4 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Buscar club, ciudad o subdominio..."
                        className="bg-transparent border-none outline-none text-sm w-full"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                    <button 
                        onClick={() => setStatusFilter('all')}
                        className={`px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${statusFilter === 'all' ? 'bg-rotary-blue text-white shadow-md' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                    >
                        Todos
                    </button>
                    <button 
                        onClick={() => setStatusFilter('active')}
                        className={`px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${statusFilter === 'active' ? 'bg-emerald-500 text-white shadow-md' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}
                    >
                        Activos
                    </button>
                    <button 
                        onClick={() => setStatusFilter('expired')}
                        className={`px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${statusFilter === 'expired' ? 'bg-rose-500 text-white shadow-md' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'}`}
                    >
                        Vencidos
                    </button>
                    <button 
                        onClick={() => setStatusFilter('inactive')}
                        className={`px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${statusFilter === 'inactive' ? 'bg-gray-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                        Prospectos
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Club</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Ubicación</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Dominios</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Stats</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Suscripción</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wider text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {clubs
                            .filter(club => {
                                const search = searchQuery.toLowerCase();
                                const matchesSearch = (club.name || '').toLowerCase().includes(search) || 
                                                     (club.city || '').toLowerCase().includes(search) ||
                                                     (club.subdomain || '').toLowerCase().includes(search);
                                
                                if (statusFilter === 'all') return matchesSearch;
                                return matchesSearch && club.subscriptionStatus === statusFilter;
                            })
                            .map((club) => (
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
                                        <a href={`https://app.clubplatform.org/?club=${club.subdomain || 'no-sub'}`} target="_blank" rel="noopener noreferrer" className="text-rotary-blue hover:underline text-[10px]">
                                            app.clubplatform.org/?club={club.subdomain || 'no-sub'}
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
                                    <div className="flex flex-col gap-1">
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase w-fit ${
                                            club.subscriptionStatus === 'active' ? 'bg-emerald-100 text-emerald-700' : 
                                            club.subscriptionStatus === 'expired' ? 'bg-rose-100 text-rose-700 animate-pulse' : 
                                            club.subscriptionStatus === 'inactive' ? 'bg-gray-100 text-gray-500' :
                                            'bg-amber-100 text-amber-700'
                                        }`}>
                                            {club.subscriptionStatus === 'active' ? 'Activo' : 
                                             club.subscriptionStatus === 'expired' ? 'Expirado' :
                                             club.subscriptionStatus === 'inactive' ? 'Inactivo' :
                                             'Pendiente'}
                                        </span>
                                        {club.expirationDate && (
                                            <span className="text-[10px] text-gray-400 font-medium">
                                                Exp: {new Date(club.expirationDate).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${club.status === 'active' ? 'bg-blue-50 text-rotary-blue' : 'bg-gray-100 text-gray-500'
                                        }`}>
                                        {club.status === 'active' ? 'Activo' : 'Inactivo'}
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
                                            onClick={() => handleOpenNotificationModal(club)}
                                            className="p-2 text-gray-400 hover:text-blue-500 transition-colors"
                                            title="Enviar Notificación"
                                        >
                                            <MessageSquare className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleOpenModal(club)}
                                            className="p-2 text-gray-400 hover:text-rotary-blue transition-colors"
                                            title="Editar"
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
                {clubs.length === 0 && !loading && (
                    <div className="p-12 text-center text-gray-400">
                        No hay clubes registrados actualmente.
                    </div>
                )}
            </div>

            {/* Club Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 flex-shrink-0">
                            <h2 className="text-lg font-bold text-gray-800">
                                {editingClub ? 'Editar Club' : 'Nuevo Club'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-gray-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Nombre del Club</label>
                                    <input
                                        type="text"
                                        required
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Ej: Rotary Club Medellín"
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
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Subdominio (Opcional)</label>
                                    <div className="flex items-center">
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2 border border-gray-200 rounded-l-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all"
                                            value={formData.subdomain}
                                            onChange={(e) => setFormData({ ...formData, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                                            placeholder="ej-club"
                                        />
                                        <span className="bg-gray-100 border border-l-0 border-gray-200 px-3 py-2 rounded-r-lg text-xs text-gray-400">
                                            .rotary.org
                                        </span>
                                    </div>
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

                                <div className="md:col-span-1">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Estado del Sitio</label>
                                    <select
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all"
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                                    >
                                        <option value="active">Activo</option>
                                        <option value="inactive">Inactivo</option>
                                    </select>
                                </div>

                                <div className="md:col-span-1">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Skin de Arquitectura (Footer)</label>
                                    <select
                                        className="w-full px-4 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all bg-sky-50 font-bold text-rotary-blue"
                                        value={formData.type}
                                        onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                        title="Define la estructura de links y labels del footer"
                                    >
                                        <option value="club">Skin de Rotary Club (Socio)</option>
                                        <option value="district">Skin de Distrito Rotary</option>
                                        <option value="association">Skin de Asociación / Agrupación</option>
                                        <option value="colrotarios">Skin de Colrotarios (Fundación)</option>
                                    </select>
                                </div>

                                 <div className="md:col-span-1">
                                     <label className="block text-sm font-bold text-gray-700 mb-1 italic text-rotary-blue">Estatus Suscripción SaaS</label>
                                     <select
                                         className="w-full px-4 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all bg-white"
                                         value={formData.subscriptionStatus}
                                         onChange={(e) => setFormData({ ...formData, subscriptionStatus: e.target.value })}
                                     >
                                         <option value="active">Pagado / Activo</option>
                                         <option value="expired">Expirado / Vencido</option>
                                         <option value="inactive">Inactivo (Prospecto)</option>
                                         <option value="pending">Pendiente</option>
                                     </select>
                                 </div>

                                 <div className="md:col-span-1">
                                     <label className="block text-sm font-bold text-gray-700 mb-1 italic text-rotary-blue">Fecha Expiración SaaS</label>
                                     <input
                                         type="date"
                                         className="w-full px-4 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all"
                                         value={formData.expirationDate}
                                         onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
                                     />
                                 </div>

                                 <div className="md:col-span-1">
                                     <label className="block text-sm font-bold text-gray-700 mb-1">Email de Contacto Facturación</label>
                                     <input
                                         type="email"
                                         className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all"
                                         value={formData.billingContactEmail}
                                         onChange={(e) => setFormData({ ...formData, billingContactEmail: e.target.value })}
                                         placeholder="ej: presidente@club.org"
                                     />
                                 </div>

                                 <div className="md:col-span-1">
                                     <label className="block text-sm font-bold text-gray-700 mb-1">WhatsApp de Contacto (con 57...)</label>
                                     <input
                                         type="text"
                                         className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all"
                                         value={formData.billingContactPhone}
                                         onChange={(e) => setFormData({ ...formData, billingContactPhone: e.target.value })}
                                         placeholder="ej: 573001234567"
                                     />
                                 </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Usuario Administrador (Opcional)</label>
                                    <select
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none transition-all bg-white"
                                        value={formData.adminUserId}
                                        onChange={(e) => setFormData({ ...formData, adminUserId: e.target.value })}
                                    >
                                        <option value="">-- Seleccionar Administrador --</option>
                                        {superUsers.map(u => (
                                            <option key={u.id} value={u.id}>{u.email} ({u.role})</option>
                                        ))}
                                    </select>
                                    <p className="text-[10px] text-gray-400 mt-1">Si seleccionas un administrador, se asignará a este club. Puedes ajustarlo individualmente en "Usuarios".</p>
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
                                    {isSubmitting ? 'Guardando...' : (editingClub ? 'Guardar Cambios' : 'Crear Club')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Notification Modal (Communication Center) */}
            {isNotificationModalOpen && notifyingClub && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 border border-gray-100">
                        <div className="bg-rotary-blue p-6 text-white flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/20 rounded-xl">
                                    <MessageSquare className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-black">Centro de Comunicación</h2>
                                    <p className="text-sky-100 text-xs font-medium">Enviando a: {notifyingClub.name}</p>
                                </div>
                            </div>
                            <button onClick={() => setIsNotificationModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-8">
                            <div className="flex gap-4 mb-8 p-1 bg-gray-50 rounded-2xl border border-gray-100">
                                <button
                                    onClick={() => setNotificationData({ ...notificationData, type: 'whatsapp', recipient: notifyingClub.billingContactPhone || '' })}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${notificationData.type === 'whatsapp' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
                                >
                                    <MessageSquare className="w-4 h-4" /> WhatsApp
                                </button>
                                <button
                                    onClick={() => setNotificationData({ ...notificationData, type: 'email', recipient: notifyingClub.billingContactEmail || '' })}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all ${notificationData.type === 'email' ? 'bg-white text-rotary-blue shadow-sm' : 'text-gray-500 hover:bg-gray-100'}`}
                                >
                                    <Mail className="w-4 h-4" /> Email
                                </button>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Destinatario ({notificationData.type === 'email' ? 'Email' : 'WhatsApp'})</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue outline-none transition-all font-medium"
                                        value={notificationData.recipient}
                                        onChange={(e) => setNotificationData({ ...notificationData, recipient: e.target.value })}
                                        placeholder={notificationData.type === 'email' ? "correo@ejemplo.com" : "573001234567"}
                                    />
                                    {!notificationData.recipient && (
                                        <p className="mt-2 text-xs text-amber-600 font-bold flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" /> Este club no tiene configurado un contacto de facturación.
                                        </p>
                                    )}
                                </div>

                                {notificationData.type === 'email' && (
                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Asunto del Correo</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue outline-none transition-all font-medium"
                                            value={notificationData.subject}
                                            onChange={(e) => setNotificationData({ ...notificationData, subject: e.target.value })}
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Mensaje (Personalizable)</label>
                                    <textarea
                                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue outline-none transition-all font-medium min-h-[200px]"
                                        value={notificationData.content}
                                        onChange={(e) => setNotificationData({ ...notificationData, content: e.target.value })}
                                    />
                                    <p className="mt-2 text-[10px] text-gray-400 font-medium">
                                        Consejo: Mantén un tono cordial e institucional (Diplomacia Rotary).
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-8">
                                <button
                                    onClick={() => setIsNotificationModalOpen(false)}
                                    className="px-6 py-3 text-gray-500 font-bold hover:bg-gray-50 rounded-xl transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSendNotification}
                                    disabled={isSubmitting || !notificationData.recipient}
                                    className="bg-rotary-blue text-white px-8 py-3 rounded-xl font-bold hover:bg-sky-800 transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-sky-100"
                                >
                                    {isSubmitting ? (
                                        <><RefreshCw className="w-4 h-4 animate-spin" /> Enviando...</>
                                    ) : (
                                        <><Send className="w-4 h-4" /> Enviar Notificación</>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default ClubsManagement;
