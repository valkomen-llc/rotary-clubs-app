import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import {
    Plus, Edit2, Trash2, Globe, MapPin, X, Search, Users,
    FolderKanban, ChevronRight, Network, Building2, Mail,
    ExternalLink, CheckCircle, XCircle, Loader2, ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';

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
    clubs?: Club[];
    createdAt: string;
}

interface Club {
    id: string;
    name: string;
    city: string;
    country: string;
    subdomain: string | null;
    domain: string | null;
    status: string;
}

const emptyForm = {
    number: '',
    name: '',
    governor: '',
    governorEmail: '',
    countries: '',
    website: '',
    subdomain: '',
    domain: '',
    description: '',
    status: 'active'
};

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

    useEffect(() => { fetchDistricts(); }, []);

    const token = () => localStorage.getItem('rotary_token');

    const fetchDistricts = async () => {
        try {
            const res = await fetch(`${API}/admin/districts?_t=${Date.now()}`, {
                headers: { Authorization: `Bearer ${token()}`, 'Cache-Control': 'no-cache' }
            });
            if (res.ok) setDistricts(await res.json());
        } catch { toast.error('Error al cargar distritos'); }
        finally { setLoading(false); }
    };

    const openDetail = async (dist: District) => {
        setDetailDistrict(dist);
        setDetailLoading(true);
        try {
            const res = await fetch(`${API}/admin/districts/${dist.id}`, {
                headers: { Authorization: `Bearer ${token()}` }
            });
            if (res.ok) setDetailDistrict(await res.json());
        } catch { } finally { setDetailLoading(false); }
    };

    const openModal = (dist?: District) => {
        if (dist) {
            setEditingDistrict(dist);
            setFormData({
                number: String(dist.number),
                name: dist.name || '',
                governor: dist.governor || '',
                governorEmail: dist.governorEmail || '',
                countries: (dist.countries || []).join(', '),
                website: dist.website || '',
                subdomain: dist.subdomain || '',
                domain: dist.domain || '',
                description: dist.description || '',
                status: dist.status || 'active'
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
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                toast.success(editingDistrict ? 'Distrito actualizado' : 'Distrito creado');
                setIsModalOpen(false);
                fetchDistricts();
            } else {
                const err = await res.json();
                toast.error(err.error || 'Error al guardar');
            }
        } catch { toast.error('Error de conexión'); }
        finally { setIsSubmitting(false); }
    };

    const handleDelete = async (dist: District) => {
        if (!window.confirm(`¿Eliminar "${dist.name}"?\nLos clubes asociados quedarán sin distrito.`)) return;
        try {
            const res = await fetch(`${API}/admin/districts/${dist.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token()}` }
            });
            if (res.ok) { toast.success('Distrito eliminado'); fetchDistricts(); if (detailDistrict?.id === dist.id) setDetailDistrict(null); }
            else toast.error('No se pudo eliminar');
        } catch { toast.error('Error de conexión'); }
    };

    const filtered = districts.filter(d =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        String(d.number).includes(search) ||
        (d.governor || '').toLowerCase().includes(search.toLowerCase())
    );

    // ─── Detail View ─────────────────────────────────────────────────────────────
    if (detailDistrict) {
        return (
            <AdminLayout>
                <div className="space-y-8">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setDetailDistrict(null)} className="p-2 rounded-xl hover:bg-gray-100 transition-colors">
                            <ArrowLeft className="w-5 h-5 text-gray-500" />
                        </button>
                        <div>
                            <h1 className="text-2xl font-bold text-gray-900">Distrito {detailDistrict.number}</h1>
                            <p className="text-gray-500 text-sm">{detailDistrict.name}</p>
                        </div>
                        <div className="ml-auto flex gap-2">
                            <button onClick={() => { openModal(detailDistrict); }}
                                className="flex items-center gap-2 px-4 py-2 bg-rotary-blue text-white rounded-xl text-sm font-bold hover:bg-sky-800 transition-colors">
                                <Edit2 className="w-4 h-4" /> Editar
                            </button>
                        </div>
                    </div>

                    {/* Stats cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[
                            { label: 'Clubes asignados', value: detailDistrict.clubs?.length ?? detailDistrict.clubCount ?? 0, icon: Building2, color: 'text-rotary-blue bg-blue-50' },
                            { label: 'Países / Regiones', value: (detailDistrict.countries || []).length, icon: Globe, color: 'text-emerald-600 bg-emerald-50' },
                            { label: 'Estado', value: detailDistrict.status === 'active' ? 'Activo' : 'Inactivo', icon: detailDistrict.status === 'active' ? CheckCircle : XCircle, color: detailDistrict.status === 'active' ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50' },
                        ].map((s, i) => (
                            <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${s.color}`}>
                                    <s.icon className="w-6 h-6" />
                                </div>
                                <div>
                                    <p className="text-2xl font-black text-gray-900">{s.value}</p>
                                    <p className="text-xs text-gray-500 font-medium">{s.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Info */}
                        <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
                            <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider text-gray-500">Información del Distrito</h3>
                            {detailDistrict.governor && (
                                <div className="flex items-start gap-3">
                                    <Users className="w-4 h-4 text-gray-400 mt-0.5" />
                                    <div>
                                        <p className="text-xs text-gray-400 font-bold uppercase">Gobernador</p>
                                        <p className="text-sm font-semibold text-gray-800">{detailDistrict.governor}</p>
                                    </div>
                                </div>
                            )}
                            {detailDistrict.governorEmail && (
                                <div className="flex items-start gap-3">
                                    <Mail className="w-4 h-4 text-gray-400 mt-0.5" />
                                    <div>
                                        <p className="text-xs text-gray-400 font-bold uppercase">Email</p>
                                        <a href={`mailto:${detailDistrict.governorEmail}`} className="text-sm text-rotary-blue hover:underline">{detailDistrict.governorEmail}</a>
                                    </div>
                                </div>
                            )}
                            {(detailDistrict.countries || []).length > 0 && (
                                <div className="flex items-start gap-3">
                                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                                    <div>
                                        <p className="text-xs text-gray-400 font-bold uppercase">Países / Regiones</p>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {detailDistrict.countries.map(c => (
                                                <span key={c} className="px-2 py-0.5 bg-blue-50 text-rotary-blue text-xs font-semibold rounded-full">{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                            {detailDistrict.website && (
                                <div className="flex items-start gap-3">
                                    <Globe className="w-4 h-4 text-gray-400 mt-0.5" />
                                    <div>
                                        <p className="text-xs text-gray-400 font-bold uppercase">Sitio Web</p>
                                        <a href={detailDistrict.website.startsWith('http') ? detailDistrict.website : `https://${detailDistrict.website}`}
                                            target="_blank" rel="noopener noreferrer" className="text-sm text-rotary-blue hover:underline flex items-center gap-1">
                                            {detailDistrict.website} <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                </div>
                            )}
                            {detailDistrict.description && (
                                <div className="pt-2 border-t border-gray-100">
                                    <p className="text-xs text-gray-400 font-bold uppercase mb-1">Descripción</p>
                                    <p className="text-sm text-gray-600 leading-relaxed">{detailDistrict.description}</p>
                                </div>
                            )}
                        </div>

                        {/* Clubs list */}
                        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-rotary-blue" /> Clubes del Distrito
                                </h3>
                                {detailLoading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                            </div>
                            {(detailDistrict.clubs || []).length === 0 ? (
                                <div className="p-12 text-center text-gray-400">
                                    <Building2 className="w-8 h-8 mx-auto mb-3 opacity-30" />
                                    <p className="text-sm font-medium">No hay clubes asignados a este distrito.</p>
                                    <p className="text-xs mt-1">Los clubes se asignan desde Gestión de Clubes.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-50">
                                    {(detailDistrict.clubs || []).map(club => (
                                        <div key={club.id} className="px-6 py-3 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                                            <div className="w-8 h-8 rounded-lg bg-blue-50 text-rotary-blue flex items-center justify-center font-bold text-sm">
                                                {club.name.charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-gray-900 text-sm truncate">{club.name}</p>
                                                <p className="text-xs text-gray-400">{club.city}, {club.country}</p>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${club.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                                {club.status}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Modal cuando se abre desde el detalle */}
                {isModalOpen && renderModal()}
            </AdminLayout>
        );
    }

    // ─── Modal ────────────────────────────────────────────────────────────────────
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
                                value={formData.number}
                                onChange={e => setFormData({ ...formData, number: e.target.value })} />
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
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Gobernador del Distrito</label>
                            <input type="text" placeholder="Nombre del gobernador"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-none text-sm"
                                value={formData.governor}
                                onChange={e => setFormData({ ...formData, governor: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Email del Gobernador</label>
                            <input type="email" placeholder="gobernador@rotary.org"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-none text-sm"
                                value={formData.governorEmail}
                                onChange={e => setFormData({ ...formData, governorEmail: e.target.value })} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Países / Regiones que cubre</label>
                            <input type="text" placeholder="Colombia, Venezuela, Ecuador (separados por coma)"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-none text-sm"
                                value={formData.countries}
                                onChange={e => setFormData({ ...formData, countries: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Sitio Web</label>
                            <input type="text" placeholder="www.distrito4271.org"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-none text-sm"
                                value={formData.website}
                                onChange={e => setFormData({ ...formData, website: e.target.value })} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Subdominio</label>
                            <div className="flex items-center">
                                <input type="text" placeholder="distrito4271"
                                    className="w-full px-4 py-2.5 border border-gray-200 rounded-l-xl focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-none text-sm"
                                    value={formData.subdomain}
                                    onChange={e => setFormData({ ...formData, subdomain: e.target.value })} />
                                <span className="bg-gray-100 border border-l-0 border-gray-200 px-3 py-2.5 rounded-r-xl text-xs text-gray-400 whitespace-nowrap">.rotary.org</span>
                            </div>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Dominio Propio (Opcional)</label>
                            <input type="text" placeholder="distrito4271.org"
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-none text-sm"
                                value={formData.domain}
                                onChange={e => setFormData({ ...formData, domain: e.target.value.toLowerCase().replace(/https?:\/\//g, '').replace(/^www\./, '') })} />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-600 mb-1 uppercase tracking-wider">Descripción</label>
                            <textarea rows={3} placeholder="Descripción del distrito, su alcance, objetivos..."
                                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-none text-sm resize-none"
                                value={formData.description}
                                onChange={e => setFormData({ ...formData, description: e.target.value })} />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-gray-500 font-bold hover:text-gray-700">
                            Cancelar
                        </button>
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

    // ─── List View ────────────────────────────────────────────────────────────────
    return (
        <AdminLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                            <Network className="w-6 h-6 text-rotary-blue" /> Gestión de Distritos
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">Administra los distritos Rotary y los clubes que pertenecen a cada uno.</p>
                    </div>
                    <button onClick={() => openModal()}
                        className="flex items-center gap-2 bg-rotary-blue text-white px-5 py-2.5 rounded-xl hover:bg-sky-800 transition-colors font-bold text-sm shadow-md shadow-rotary-blue/20">
                        <Plus className="w-4 h-4" /> Nuevo Distrito
                    </button>
                </div>

                {/* Search */}
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" placeholder="Buscar por nombre, número o gobernador..."
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-rotary-blue/20 focus:border-rotary-blue outline-none text-sm"
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>

                {/* Stats banner */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {[
                        { label: 'Total Distritos', value: districts.length, color: 'bg-blue-50 text-rotary-blue' },
                        { label: 'Activos', value: districts.filter(d => d.status === 'active').length, color: 'bg-green-50 text-green-700' },
                        { label: 'Total Clubes', value: districts.reduce((a, d) => a + (Number(d.clubCount) || 0), 0), color: 'bg-indigo-50 text-indigo-700' },
                        { label: 'Países', value: [...new Set(districts.flatMap(d => d.countries || []))].length, color: 'bg-amber-50 text-amber-700' },
                    ].map((s, i) => (
                        <div key={i} className={`${s.color} rounded-2xl px-5 py-4`}>
                            <p className="text-2xl font-black">{s.value}</p>
                            <p className="text-xs font-bold opacity-70 mt-0.5">{s.label}</p>
                        </div>
                    ))}
                </div>

                {/* Grid de distritos */}
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 className="w-8 h-8 animate-spin text-rotary-blue" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-16 text-center">
                        <Network className="w-12 h-12 mx-auto text-gray-200 mb-4" />
                        <h3 className="text-lg font-bold text-gray-500">No hay distritos {search ? 'que coincidan' : 'registrados'}</h3>
                        <p className="text-sm text-gray-400 mt-2">
                            {search ? 'Prueba con otra búsqueda.' : 'Crea el primer distrito para comenzar.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {filtered.map(dist => (
                            <div key={dist.id}
                                className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden group">
                                {/* Header card */}
                                <div className="bg-gradient-to-br from-rotary-blue to-blue-700 p-5 text-white relative">
                                    <div className="absolute top-3 right-3 flex gap-1">
                                        <button onClick={() => openModal(dist)}
                                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors opacity-0 group-hover:opacity-100">
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => handleDelete(dist)}
                                            className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/60 transition-colors opacity-0 group-hover:opacity-100">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center font-black text-lg">
                                            {dist.number}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-black text-sm leading-tight truncate">{dist.name}</p>
                                            <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${dist.status === 'active' ? 'bg-green-400/30 text-white' : 'bg-red-400/30 text-white'}`}>
                                                {dist.status === 'active' ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Body */}
                                <div className="p-5 space-y-3">
                                    {dist.governor && (
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                            <span className="truncate">{dist.governor}</span>
                                        </div>
                                    )}
                                    {(dist.countries || []).length > 0 && (
                                        <div className="flex items-start gap-2">
                                            <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                                            <div className="flex flex-wrap gap-1">
                                                {dist.countries.slice(0, 3).map(c => (
                                                    <span key={c} className="px-2 py-0.5 bg-blue-50 text-rotary-blue text-[10px] font-bold rounded-full">{c}</span>
                                                ))}
                                                {dist.countries.length > 3 && (
                                                    <span className="text-[10px] text-gray-400 py-0.5">+{dist.countries.length - 3}</span>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                        <div className="flex items-center gap-1 text-sm font-bold text-gray-700">
                                            <Building2 className="w-4 h-4 text-rotary-blue" />
                                            <span>{dist.clubCount || 0} clubes</span>
                                        </div>
                                        <button onClick={() => openDetail(dist)}
                                            className="flex items-center gap-1 text-xs font-bold text-rotary-blue hover:text-sky-800 transition-colors">
                                            Ver detalle <ChevronRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && renderModal()}
        </AdminLayout>
    );
};

export default DistrictsManagement;
