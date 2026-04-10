import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Plus, Edit2, Trash2, Globe, MapPin, X, Search, Users,
    Network, Building2, Mail, ExternalLink, CheckCircle,
    Loader2, ArrowLeft, Shield, Copy, RefreshCw, AlertTriangle,
    Eye, EyeOff, Lock, UserPlus, Wifi, WifiOff, Settings, LogIn
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

interface District {
    id: string;
    number: number;
    name: string;
    governor: string | null;
    governorEmail: string | null;
    countries: string[];
    website: string | null;
    subdomain: string | null;
    domain: string | null;
    description: string | null;
    status: string;
    clubCount?: number;
    adminCount?: number;
    clubs?: Club[];
    admins?: DistrictAdmin[];
    createdAt: string;
}

interface Club { id: string; name: string; city: string; country: string; subdomain: string | null; domain: string | null; status: string; }
interface DistrictAdmin { id: string; email: string; role: string; createdAt: string; }

const emptyForm = {
    number: '', name: '', governor: '', governorEmail: '',
    countries: '', website: '', subdomain: '', domain: '', description: '', status: 'active', adminUserId: ''
};

const DNS_IP = '76.76.21.21';

const DistrictsManagement: React.FC = () => {
    const [districts, setDistricts] = useState<District[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingDistrict, setEditingDistrict] = useState<District | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formData, setFormData] = useState(emptyForm);
    const [detailDistrict, setDetailDistrict] = useState<District | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'clubs' | 'domain' | 'admins'>('clubs');
    const [domainStatus, setDomainStatus] = useState<any>(null);
    const [domainLoading, setDomainLoading] = useState(false);
    const [provisioning, setProvisioning] = useState(false);
    // New admin form
    const [superUsers, setSuperUsers] = useState<any[]>([]);
    const [newAdminEmail, setNewAdminEmail] = useState('');
    const [newAdminPass, setNewAdminPass] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [addingAdmin, setAddingAdmin] = useState(false);
    const [showAdminForm, setShowAdminForm] = useState(false);
    const { impersonate } = useAuth();

    useEffect(() => { fetchDistricts(); }, []);

    const token = () => localStorage.getItem('rotary_token');
    const authH = () => ({ Authorization: `Bearer ${token()}`, 'Cache-Control': 'no-cache' });

    const fetchDistricts = async () => {
        try {
            const [distRes, usersRes] = await Promise.all([
                fetch(`${API}/admin/districts?_t=${Date.now()}`, { headers: authH() }),
                fetch(`${API}/admin/users`, { headers: authH() })
            ]);
            if (distRes.ok) setDistricts(await distRes.json());
            if (usersRes.ok) {
                const usersData = await usersRes.json();
                setSuperUsers(usersData.filter((u: any) => u.role === 'administrator' || u.role === 'club_admin' || u.role === 'district_admin'));
            }
        } catch { toast.error('Error al cargar distritos'); }
        finally { setLoading(false); }
    };

    const openDetail = async (dist: District) => {
        setDetailDistrict(dist);
        setActiveTab('clubs');
        setDomainStatus(null);
        setDetailLoading(true);
        try {
            const res = await fetch(`${API}/admin/districts/${dist.id}`, { headers: authH() });
            if (res.ok) setDetailDistrict(await res.json());
        } catch { } finally { setDetailLoading(false); }
    };

    const fetchDomainStatus = async (distId: string) => {
        setDomainLoading(true);
        try {
            const res = await fetch(`${API}/admin/districts/${distId}/domain-status`, { headers: authH() });
            if (res.ok) setDomainStatus(await res.json());
        } catch { } finally { setDomainLoading(false); }
    };

    const handleProvisionDomain = async () => {
        if (!detailDistrict) return;
        setProvisioning(true);
        try {
            const res = await fetch(`${API}/admin/districts/${detailDistrict.id}/provision-domain`, {
                method: 'POST', headers: authH()
            });
            const data = await res.json();
            if (res.ok && data.success) {
                toast.success(data.message);
                fetchDomainStatus(detailDistrict.id);
            } else {
                toast.error(data.message || 'Error al provisionar');
            }
        } catch { toast.error('Error de conexión'); }
        finally { setProvisioning(false); }
    };

    const handleAddAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!detailDistrict) return;
        setAddingAdmin(true);
        try {
            const res = await fetch(`${API}/admin/districts/${detailDistrict.id}/admins`, {
                method: 'POST',
                headers: { ...authH(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: newAdminEmail, password: newAdminPass })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`Admin ${newAdminEmail} creado`);
                setNewAdminEmail(''); setNewAdminPass(''); setShowAdminForm(false);
                // Refrescar detalle
                openDetail(detailDistrict);
            } else {
                toast.error(data.error || 'Error al crear admin');
            }
        } catch { toast.error('Error de conexión'); }
        finally { setAddingAdmin(false); }
    };

    const handleDeleteAdmin = async (userId: string, email: string) => {
        if (!detailDistrict || !window.confirm(`¿Eliminar al administrador ${email}?`)) return;
        try {
            await fetch(`${API}/admin/districts/${detailDistrict.id}/admins/${userId}`, {
                method: 'DELETE', headers: authH()
            });
            toast.success('Administrador eliminado');
            openDetail(detailDistrict);
        } catch { toast.error('Error al eliminar'); }
    };

    const openModal = (dist?: District) => {
        if (dist) {
            setEditingDistrict(dist);
            setFormData({
                number: String(dist.number), name: dist.name || '',
                governor: dist.governor || '', governorEmail: dist.governorEmail || '',
                countries: (dist.countries || []).join(', '), website: dist.website || '',
                subdomain: dist.subdomain || '', domain: dist.domain || '',
                description: dist.description || '', status: dist.status || 'active',
                adminUserId: ''
            });
        } else {
            setEditingDistrict(null);
            setFormData(emptyForm);
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        const payload = {
            ...formData,
            number: parseInt(formData.number, 10),
            countries: formData.countries.split(',').map(s => s.trim()).filter(Boolean)
        };
        try {
            const url = editingDistrict ? `${API}/admin/districts/${editingDistrict.id}` : `${API}/admin/districts`;
            const res = await fetch(url, {
                method: editingDistrict ? 'PUT' : 'POST',
                headers: { ...authH(), 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                toast.success(editingDistrict ? 'Distrito actualizado' : 'Distrito creado');
                setIsModalOpen(false);
                fetchDistricts();
                if (detailDistrict) openDetail({ ...detailDistrict, ...payload as any });
            } else {
                const err = await res.json();
                toast.error(err.error || 'Error al guardar');
            }
        } catch { toast.error('Error de conexión'); }
        finally { setIsSubmitting(false); }
    };

    const handleDelete = async (dist: District) => {
        if (!window.confirm(`¿Eliminar "${dist.name}"?\nLos clubes y admins quedarán sin distrito.`)) return;
        try {
            const res = await fetch(`${API}/admin/districts/${dist.id}`, { method: 'DELETE', headers: authH() });
            if (res.ok) { toast.success('Distrito eliminado'); fetchDistricts(); if (detailDistrict?.id === dist.id) setDetailDistrict(null); }
            else toast.error('No se pudo eliminar');
        } catch { toast.error('Error'); }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copiado al portapapeles');
    };

    const handleImpersonate = async (districtId: string, name: string) => {
        try {
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${API}/auth/impersonate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ targetId: districtId, type: 'district' })
            });
            if (res.ok) {
                const data = await res.json();
                toast.success(`Entrando como ${name}...`);
                impersonate(data.token, data.user);
            } else {
                const data = await res.json();
                throw new Error(data.error || 'No se pudo simular distrito');
            }
        } catch (error: any) {
            toast.error(error.message);
        }
    };

    const filtered = districts.filter(d =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        String(d.number).includes(search) ||
        (d.governor || '').toLowerCase().includes(search.toLowerCase())
    );

    // ─── Modal de creación/edición ─────────────────────────────────────────────
    const renderModal = () => (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <h2 className="text-lg font-bold text-gray-800">
                        {editingDistrict ? `Editar — Distrito ${editingDistrict.number}` : 'Nuevo Distrito Rotary'}
                    </h2>
                    <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 max-h-[80vh] overflow-y-auto space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Número de Distrito *</label>
                            <input type="number" required min={1} placeholder="Ej: 4271"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-none text-sm"
                                value={formData.number} onChange={e => setFormData({ ...formData, number: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Estado</label>
                            <select className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none text-sm"
                                value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                                <option value="active">Activo</option>
                                <option value="inactive">Inactivo</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Nombre del Distrito *</label>
                            <input type="text" required placeholder="Ej: Distrito 4271 — Colombia"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-none text-sm"
                                value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Gobernador</label>
                            <input type="text" placeholder="Nombre del gobernador"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none text-sm"
                                value={formData.governor} onChange={e => setFormData({ ...formData, governor: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Email del Gobernador</label>
                            <input type="email" placeholder="gobernador@rotary.org"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none text-sm"
                                value={formData.governorEmail} onChange={e => setFormData({ ...formData, governorEmail: e.target.value })} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Países / Regiones</label>
                            <input type="text" placeholder="Colombia, Venezuela, Ecuador (separados por coma)"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none text-sm"
                                value={formData.countries} onChange={e => setFormData({ ...formData, countries: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Sitio Web Oficial</label>
                            <input type="text" placeholder="www.distrito4271.org"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none text-sm"
                                value={formData.website} onChange={e => setFormData({ ...formData, website: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Subdominio de Plataforma</label>
                            <div className="flex items-center">
                                <input type="text" placeholder="d4271"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-l-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none text-sm"
                                    value={formData.subdomain} onChange={e => setFormData({ ...formData, subdomain: e.target.value })} />
                                <span className="bg-gray-100 border border-l-0 border-gray-200 px-3 py-2.5 rounded-r-xl text-xs text-gray-400 whitespace-nowrap">.clubplatform.org</span>
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Usuario Administrador (Opcional)</label>
                            <select
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none text-sm bg-white"
                                value={formData.adminUserId} onChange={e => setFormData({ ...formData, adminUserId: e.target.value })}
                                disabled={!!editingDistrict}
                            >
                                <option value="">-- Seleccionar Administrador --</option>
                                {superUsers.map(u => (
                                    <option key={u.id} value={u.id}>{u.email} ({u.role})</option>
                                ))}
                            </select>
                            {editingDistrict && <p className="text-[10px] text-orange-500 mt-1">El administrador original ya fue asignado. Se actualiza individualmente en los detalles del distrito.</p>}
                        </div>

                        {/* Dominio propio — sección destacada */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">
                                Dominio Propio del Distrito
                                <span className="ml-2 px-1.5 py-0.5 bg-blue-100 text-rotary-blue text-[9px] rounded font-bold">Auto-provisionado</span>
                            </label>
                            <input type="text"
                                placeholder="Ej: distrito4271.org  (sin https:// ni www)"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-none text-sm"
                                value={formData.domain}
                                onChange={e => setFormData({ ...formData, domain: e.target.value.toLowerCase().replace(/https?:\/\//g, '').replace(/^www\./, '') })} />

                            {formData.domain && (
                                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm space-y-2">
                                    <div className="flex items-center gap-2 text-amber-800 font-bold">
                                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                                        Configura los DNS de tu dominio para que apunte a esta plataforma
                                    </div>
                                    <div className="bg-white border border-amber-100 rounded-lg p-3 space-y-1.5 text-xs font-mono">
                                        <div className="flex items-center justify-between">
                                            <div><span className="text-gray-400 mr-2">Tipo:</span><strong>A</strong></div>
                                            <div><span className="text-gray-400 mr-2">Nombre:</span><strong>@</strong></div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-400 mr-2">Valor:</span>
                                                <strong className="text-rotary-blue bg-blue-50 px-2 py-0.5 rounded">{DNS_IP}</strong>
                                                <button type="button" onClick={() => copyToClipboard(DNS_IP)} className="text-gray-400 hover:text-rotary-blue">
                                                    <Copy className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div><span className="text-gray-400 mr-2">Tipo:</span><strong>CNAME</strong></div>
                                            <div><span className="text-gray-400 mr-2">Nombre:</span><strong>www</strong></div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-gray-400 mr-2">Valor:</span>
                                                <strong className="text-rotary-blue bg-blue-50 px-2 py-0.5 rounded">cname.vercel-dns.com</strong>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-amber-700 text-xs">Al guardar, el dominio se registrará automáticamente en nuestra plataforma (Vercel).</p>
                                </div>
                            )}
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Descripción</label>
                            <textarea rows={3} placeholder="Descripción del distrito, su alcance y objetivos..."
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none text-sm resize-none"
                                value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-gray-500 font-bold hover:text-gray-700">Cancelar</button>
                        <button type="submit" disabled={isSubmitting}
                            className="bg-rotary-blue text-white px-8 py-2.5 rounded-full font-bold hover:bg-sky-800 disabled:opacity-50 flex items-center gap-2 transition-all">
                            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                            {isSubmitting ? 'Guardando...' : (editingDistrict ? 'Guardar Cambios' : 'Crear Distrito')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );

    // ─── Vista de Detalle ──────────────────────────────────────────────────────
    if (detailDistrict) {
        const tabs = [
            { key: 'clubs', label: 'Clubes', icon: Building2, count: detailDistrict.clubs?.length ?? 0 },
            { key: 'domain', label: 'Dominio', icon: Globe, count: null },
            { key: 'admins', label: 'Administradores', icon: Shield, count: detailDistrict.admins?.length ?? 0 },
        ];

        return (
            <AdminLayout>
                <div className="space-y-6">
                    {/* Header */}
                    <div className="flex items-center gap-4">
                        <button onClick={() => setDetailDistrict(null)} className="p-2 rounded-xl hover:bg-gray-100">
                            <ArrowLeft className="w-5 h-5 text-gray-500" />
                        </button>
                        <div className="flex-1">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-rotary-blue flex items-center justify-center text-white font-black text-sm">
                                    {detailDistrict.number}
                                </div>
                                <div>
                                    <h1 className="text-xl font-bold text-gray-900">{detailDistrict.name}</h1>
                                    <p className="text-gray-400 text-xs">{(detailDistrict.countries || []).join(', ') || 'Sin región asignada'}</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => openModal(detailDistrict)}
                                className="flex items-center gap-2 px-4 py-2 bg-rotary-blue text-white rounded-xl text-sm font-bold hover:bg-sky-800 transition-colors">
                                <Edit2 className="w-4 h-4" /> Editar Distrito
                            </button>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            { label: 'Clubes', value: detailDistrict.clubs?.length ?? 0, icon: Building2, color: 'text-rotary-blue bg-blue-50' },
                            { label: 'Administradores', value: detailDistrict.admins?.length ?? 0, icon: Shield, color: 'text-purple-600 bg-purple-50' },
                            { label: 'Países', value: (detailDistrict.countries || []).length, icon: Globe, color: 'text-emerald-600 bg-emerald-50' },
                            { label: detailDistrict.status === 'active' ? 'Activo' : 'Inactivo', value: detailDistrict.domain ? '🌐' : '—', icon: Settings, color: detailDistrict.status === 'active' ? 'text-green-700 bg-green-50' : 'text-gray-500 bg-gray-50' },
                        ].map((s, i) => (
                            <div key={i} className={`${s.color} rounded-2xl px-5 py-4 flex items-center gap-3`}>
                                <s.icon className="w-5 h-5" />
                                <div>
                                    <p className="text-xl font-black">{s.value}</p>
                                    <p className="text-xs font-bold opacity-70">{s.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Tabs */}
                    <div className="border-b border-gray-200 flex gap-1">
                        {tabs.map(tab => (
                            <button key={tab.key}
                                onClick={() => {
                                    setActiveTab(tab.key as any);
                                    if (tab.key === 'domain' && !domainStatus) fetchDomainStatus(detailDistrict.id);
                                }}
                                className={`flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === tab.key ? 'border-rotary-blue text-rotary-blue' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                                <tab.icon className="w-4 h-4" />
                                {tab.label}
                                {tab.count !== null && (
                                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${activeTab === tab.key ? 'bg-rotary-blue/10 text-rotary-blue' : 'bg-gray-100 text-gray-500'}`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* ── Tab: CLUBES ── */}
                    {activeTab === 'clubs' && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            {detailLoading ? (
                                <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
                            ) : (detailDistrict.clubs || []).length === 0 ? (
                                <div className="p-16 text-center text-gray-400">
                                    <Building2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">No hay clubes asignados a este distrito.</p>
                                    <p className="text-xs mt-1">Asigna clubes desde la sección de Gestión de Clubes.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-50">
                                    {(detailDistrict.clubs || []).map(club => (
                                        <div key={club.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                                            <div className="w-9 h-9 rounded-xl bg-blue-50 text-rotary-blue flex items-center justify-center font-black text-sm">
                                                {club.name.charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-gray-900 text-sm truncate">{club.name}</p>
                                                <p className="text-xs text-gray-400 flex items-center gap-1">
                                                    <MapPin className="w-3 h-3" /> {club.city}, {club.country}
                                                </p>
                                            </div>
                                            {club.domain && (
                                                <a href={`https://${club.domain}`} target="_blank" rel="noopener noreferrer"
                                                    className="text-xs text-rotary-blue hover:underline flex items-center gap-1">
                                                    <Globe className="w-3 h-3" /> {club.domain}
                                                </a>
                                            )}
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${club.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                                {club.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Tab: DOMINIO ── */}
                    {activeTab === 'domain' && (
                        <div className="space-y-4">
                            {/* Estado actual */}
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                <div className="flex items-center justify-between mb-5">
                                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                        <Globe className="w-5 h-5 text-rotary-blue" /> Configuración de Dominio
                                    </h3>
                                    <button onClick={() => fetchDomainStatus(detailDistrict.id)} disabled={domainLoading}
                                        className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-rotary-blue transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-50">
                                        <RefreshCw className={`w-3.5 h-3.5 ${domainLoading ? 'animate-spin' : ''}`} /> Verificar
                                    </button>
                                </div>

                                {/* Dominio actual del distrito */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                    <div className="bg-gray-50 p-4 rounded-xl">
                                        <p className="text-xs text-gray-400 font-bold uppercase mb-1">Subdominio de plataforma</p>
                                        {detailDistrict.subdomain ? (
                                            <div className="flex items-center gap-2">
                                                <a href={`https://${detailDistrict.subdomain}.clubplatform.org`} target="_blank" rel="noopener noreferrer"
                                                    className="text-sm font-semibold text-rotary-blue hover:underline flex items-center gap-1">
                                                    {detailDistrict.subdomain}.clubplatform.org <ExternalLink className="w-3 h-3" />
                                                </a>
                                            </div>
                                        ) : <p className="text-sm text-gray-400">No configurado</p>}
                                    </div>
                                    <div className="bg-gray-50 p-4 rounded-xl">
                                        <p className="text-xs text-gray-400 font-bold uppercase mb-1">Dominio propio</p>
                                        {detailDistrict.domain ? (
                                            <div className="flex items-center gap-2">
                                                <a href={`https://${detailDistrict.domain}`} target="_blank" rel="noopener noreferrer"
                                                    className="text-sm font-semibold text-rotary-blue hover:underline flex items-center gap-1">
                                                    {detailDistrict.domain} <ExternalLink className="w-3 h-3" />
                                                </a>
                                            </div>
                                        ) : <p className="text-sm text-gray-400">No configurado</p>}
                                    </div>
                                </div>

                                {/* Estado de Vercel */}
                                {detailDistrict.domain && (
                                    <>
                                        {domainLoading ? (
                                            <div className="flex items-center gap-2 text-gray-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Verificando DNS...</div>
                                        ) : domainStatus ? (
                                            <div className={`p-4 rounded-xl border flex items-start gap-3 ${domainStatus.status === 'verified' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                                                {domainStatus.status === 'verified'
                                                    ? <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                                                    : <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />}
                                                <div>
                                                    <p className={`font-bold text-sm ${domainStatus.status === 'verified' ? 'text-green-800' : 'text-amber-800'}`}>
                                                        {domainStatus.message}
                                                    </p>
                                                    {domainStatus.status !== 'verified' && (
                                                        <p className="text-xs text-amber-700 mt-1">Los cambios DNS pueden tardar hasta 48 horas en propagarse.</p>
                                                    )}
                                                </div>
                                            </div>
                                        ) : null}

                                        <button onClick={handleProvisionDomain} disabled={provisioning}
                                            className="mt-4 flex items-center gap-2 px-5 py-2.5 bg-rotary-blue text-white rounded-xl text-sm font-bold hover:bg-sky-800 disabled:opacity-50 transition-colors">
                                            {provisioning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                                            {provisioning ? 'Registrando...' : 'Registrar/Actualizar en Vercel'}
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Instrucciones DNS */}
                            {detailDistrict.domain && (
                                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                                    <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                        <Settings className="w-5 h-5 text-gray-400" /> Configuración DNS Requerida
                                    </h3>
                                    <p className="text-sm text-gray-600 mb-4">
                                        Configura los siguientes registros en el panel de tu proveedor de dominio para
                                        que <strong>{detailDistrict.domain}</strong> apunte a nuestra plataforma:
                                    </p>
                                    <div className="bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                                        <table className="w-full text-sm">
                                            <thead className="bg-gray-100 border-b border-gray-200">
                                                <tr>
                                                    {['Tipo', 'Nombre', 'Valor', 'TTL'].map(h => (
                                                        <th key={h} className="px-4 py-2.5 text-left text-xs font-black text-gray-500 uppercase tracking-wider">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100 font-mono">
                                                <tr className="hover:bg-white transition-colors">
                                                    <td className="px-4 py-3"><span className="px-2 py-0.5 bg-blue-100 text-rotary-blue rounded font-bold text-xs">A</span></td>
                                                    <td className="px-4 py-3 font-bold">@</td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-rotary-blue font-bold">{DNS_IP}</span>
                                                            <button onClick={() => copyToClipboard(DNS_IP)} className="text-gray-400 hover:text-rotary-blue" title="Copiar">
                                                                <Copy className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-400">3600</td>
                                                </tr>
                                                <tr className="hover:bg-white transition-colors">
                                                    <td className="px-4 py-3"><span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded font-bold text-xs">CNAME</span></td>
                                                    <td className="px-4 py-3 font-bold">www</td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-rotary-blue font-bold">cname.vercel-dns.com</span>
                                                            <button onClick={() => copyToClipboard('cname.vercel-dns.com')} className="text-gray-400 hover:text-rotary-blue" title="Copiar">
                                                                <Copy className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-400">3600</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                    <p className="text-xs text-gray-400 mt-3">* La propagación DNS puede tardar entre 15 minutos y 48 horas dependiendo del proveedor de dominio.</p>
                                </div>
                            )}

                            {!detailDistrict.domain && (
                                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex items-start gap-4">
                                    <WifiOff className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold text-amber-800">Sin dominio configurado</p>
                                        <p className="text-sm text-amber-700 mt-1">Edita el distrito para agregar un dominio propio. El sistema lo registrará automáticamente en Vercel.</p>
                                        <button onClick={() => openModal(detailDistrict)}
                                            className="mt-3 flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-bold hover:bg-amber-700 transition-colors">
                                            <Globe className="w-4 h-4" /> Configurar Dominio
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Tab: ADMINISTRADORES ── */}
                    {activeTab === 'admins' && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-purple-500" /> Administradores del Distrito
                                </h3>
                                <button onClick={() => setShowAdminForm(!showAdminForm)}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-colors">
                                    <UserPlus className="w-3.5 h-3.5" /> Agregar Admin
                                </button>
                            </div>

                            {/* Formulario para nuevo admin */}
                            {showAdminForm && (
                                <form onSubmit={handleAddAdmin} className="px-6 py-5 bg-purple-50 border-b border-purple-100">
                                    <p className="text-xs font-bold text-purple-800 uppercase tracking-wider mb-3">Nuevo Administrador de Distrito</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">Email *</label>
                                            <div className="flex items-center border border-gray-200 rounded-xl bg-white overflow-hidden focus-within:ring-2 focus-within:ring-purple-400">
                                                <Mail className="w-4 h-4 text-gray-400 ml-3" />
                                                <input type="email" required placeholder="admin@distrito4271.org"
                                                    className="flex-1 px-3 py-2.5 text-sm outline-none"
                                                    value={newAdminEmail} onChange={e => setNewAdminEmail(e.target.value)} />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">Contraseña Temporal *</label>
                                            <div className="flex items-center border border-gray-200 rounded-xl bg-white overflow-hidden focus-within:ring-2 focus-within:ring-purple-400">
                                                <Lock className="w-4 h-4 text-gray-400 ml-3" />
                                                <input type={showPass ? 'text' : 'password'} required minLength={8} placeholder="Mínimo 8 caracteres"
                                                    className="flex-1 px-3 py-2.5 text-sm outline-none"
                                                    value={newAdminPass} onChange={e => setNewAdminPass(e.target.value)} />
                                                <button type="button" onClick={() => setShowPass(!showPass)} className="px-3 text-gray-400 hover:text-gray-600">
                                                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 mt-3">
                                        <button type="button" onClick={() => { setShowAdminForm(false); setNewAdminEmail(''); setNewAdminPass(''); }}
                                            className="px-4 py-2 text-sm text-gray-500 font-bold hover:text-gray-700">Cancelar</button>
                                        <button type="submit" disabled={addingAdmin}
                                            className="flex items-center gap-2 px-5 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 disabled:opacity-50 transition-colors">
                                            {addingAdmin && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            {addingAdmin ? 'Creando...' : 'Crear Administrador'}
                                        </button>
                                    </div>
                                    <div className="mt-3 p-3 bg-purple-100 rounded-lg text-xs text-purple-800">
                                        <strong>Rol asignado:</strong> <code className="bg-white px-1.5 py-0.5 rounded font-mono">district_admin</code> — El usuario podrá gestionar el contenido del distrito pero no tendrá acceso al panel global de la plataforma.
                                    </div>
                                </form>
                            )}

                            {(detailDistrict.admins || []).length === 0 ? (
                                <div className="p-16 text-center text-gray-400">
                                    <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                    <p className="font-medium">No hay administradores asignados.</p>
                                    <p className="text-xs mt-1">Crea un usuario con rol <code>district_admin</code> para gestionar este distrito.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-50">
                                    {(detailDistrict.admins || []).map(admin => (
                                        <div key={admin.id} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                                            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-black text-sm">
                                                {admin.email.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-gray-900 text-sm truncate">{admin.email}</p>
                                                <p className="text-xs text-gray-400">
                                                    Creado: {new Date(admin.createdAt).toLocaleDateString('es-CO', { year: 'numeric', month: 'short', day: 'numeric' })}
                                                </p>
                                            </div>
                                            <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-[10px] font-black uppercase tracking-wider">
                                                {admin.role}
                                            </span>
                                            <button onClick={() => handleDeleteAdmin(admin.id, admin.email)}
                                                className="p-2 text-gray-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {isModalOpen && renderModal()}
            </AdminLayout>
        );
    }

    // ─── Vista de Lista (Grid) ─────────────────────────────────────────────────
    return (
        <AdminLayout>
            <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Network className="w-6 h-6 text-rotary-blue" /> Gestión de Distritos
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">Administra distritos Rotary, sus dominios, clubes y administradores.</p>
                    </div>
                    <button onClick={() => openModal()}
                        className="flex items-center gap-2 bg-rotary-blue text-white px-5 py-2.5 rounded-xl hover:bg-sky-800 transition-colors font-bold text-sm shadow-md shadow-rotary-blue/20">
                        <Plus className="w-4 h-4" /> Nuevo Distrito
                    </button>
                </div>

                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" placeholder="Buscar por número, nombre o gobernador..."
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 outline-none text-sm"
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        { label: 'Total Distritos', value: districts.length, color: 'bg-blue-50 text-rotary-blue' },
                        { label: 'Activos', value: districts.filter(d => d.status === 'active').length, color: 'bg-green-50 text-green-700' },
                        { label: 'Total Clubes', value: districts.reduce((a, d) => a + (d.clubCount || 0), 0), color: 'bg-indigo-50 text-indigo-700' },
                        { label: 'Con Dominio', value: districts.filter(d => d.domain).length, color: 'bg-amber-50 text-amber-700' },
                    ].map((s, i) => (
                        <div key={i} className={`${s.color} rounded-2xl px-5 py-4`}>
                            <p className="text-2xl font-black">{s.value}</p>
                            <p className="text-xs font-bold opacity-70 mt-0.5">{s.label}</p>
                        </div>
                    ))}
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-rotary-blue" /></div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
                        <Network className="w-12 h-12 mx-auto text-gray-200 mb-4" />
                        <h3 className="text-lg font-bold text-gray-500">No hay distritos {search ? 'que coincidan' : 'registrados'}</h3>
                        <p className="text-sm text-gray-400 mt-2">{search ? 'Prueba con otra búsqueda.' : 'Crea el primer distrito para comenzar.'}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {filtered.map(dist => (
                            <div key={dist.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden group">
                                <div className="bg-gradient-to-br from-rotary-blue to-blue-700 p-5 text-white relative">
                                    <div className="absolute top-3 right-3 flex gap-1">
                                        <button onClick={() => handleImpersonate(dist.id, dist.name)} title="Ingresar como este distrito" className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 hover:text-green-300 transition-colors opacity-0 group-hover:opacity-100"><LogIn className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => openModal(dist)} title="Editar" className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors opacity-0 group-hover:opacity-100"><Edit2 className="w-3.5 h-3.5" /></button>
                                        <button onClick={() => handleDelete(dist)} title="Eliminar" className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/60 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center font-black text-lg">{dist.number}</div>
                                        <div className="min-w-0">
                                            <p className="font-black text-sm leading-tight truncate">{dist.name}</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${dist.status === 'active' ? 'bg-green-400/30' : 'bg-red-400/30'}`}>
                                                    {dist.status === 'active' ? 'Activo' : 'Inactivo'}
                                                </span>
                                                {dist.domain && <span className="text-[10px] text-white/70 flex items-center gap-1"><Globe className="w-2.5 h-2.5" />Dominio</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-5 space-y-3">
                                    {dist.governor && (
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <Users className="w-4 h-4 text-gray-400" /><span className="truncate">{dist.governor}</span>
                                        </div>
                                    )}
                                    {dist.domain && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <Globe className="w-4 h-4 text-gray-400" />
                                            <span className="text-rotary-blue truncate text-xs font-mono">{dist.domain}</span>
                                        </div>
                                    )}
                                    {(dist.countries || []).length > 0 && (
                                        <div className="flex flex-wrap gap-1">
                                            {dist.countries.slice(0, 3).map(c => (
                                                <span key={c} className="px-2 py-0.5 bg-blue-50 text-rotary-blue text-[10px] font-bold rounded-full">{c}</span>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                        <div className="flex items-center gap-3 text-xs text-gray-500">
                                            <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" />{dist.clubCount || 0} clubes</span>
                                            <span className="flex items-center gap-1"><Shield className="w-3.5 h-3.5" />{dist.adminCount || 0} admins</span>
                                        </div>
                                        <button onClick={() => openDetail(dist)}
                                            className="text-xs font-bold text-rotary-blue hover:text-sky-800 transition-colors flex items-center gap-1">
                                            Gestionar <ExternalLink className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {isModalOpen && renderModal()}
        </AdminLayout>
    );
};

export default DistrictsManagement;
