import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useAuth } from '../../hooks/useAuth';
import {
    Search, Users, Mail, Phone, MessageCircle, Filter,
    Clock, CheckCircle2, XCircle, Eye, Trash2,
    UserPlus, ArrowUpRight, MoreHorizontal, Star, Archive,
} from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

interface Lead {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    subject: string | null;
    message: string | null;
    source: string;
    status: string;
    notes: string | null;
    metadata?: any;
    createdAt: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
    new: { label: 'Nuevo', color: 'text-blue-700', bg: 'bg-blue-50', icon: Star },
    contacted: { label: 'Contactado', color: 'text-amber-700', bg: 'bg-amber-50', icon: Mail },
    qualified: { label: 'Cualificado', color: 'text-emerald-700', bg: 'bg-emerald-50', icon: CheckCircle2 },
    converted: { label: 'Convertido', color: 'text-violet-700', bg: 'bg-violet-50', icon: UserPlus },
    archived: { label: 'Archivado', color: 'text-gray-500', bg: 'bg-gray-100', icon: Archive },
    rejected: { label: 'Rechazado', color: 'text-red-600', bg: 'bg-red-50', icon: XCircle },
};

const SOURCE_LABELS: Record<string, string> = {
    contact_form: 'Formulario Contacto',
    district_multimedia_form: 'Galería Multimedia',
    newsletter: 'Newsletter',
    chatbot: 'ChatBot',
    manual: 'Manual',
};

const LeadsManagement: React.FC = () => {
    const { token } = useAuth();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [total, setTotal] = useState(0);
    const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [actionMenu, setActionMenu] = useState<string | null>(null);

    const fetchLeads = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (search.trim()) params.set('search', search.trim());

            const res = await fetch(`${API}/leads?${params}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setLeads(data.leads);
                setTotal(data.total);
                setStatusCounts(data.statusCounts || {});
            }
        } catch (err) {
            console.error('Error fetching leads:', err);
        } finally {
            setLoading(false);
        }
    }, [token, statusFilter, search]);

    useEffect(() => {
        fetchLeads();
    }, [fetchLeads]);

    const updateStatus = async (leadId: string, status: string) => {
        try {
            const res = await fetch(`${API}/leads/${leadId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ status }),
            });
            if (res.ok) {
                toast.success(`Estado actualizado a "${STATUS_CONFIG[status]?.label}"`);
                fetchLeads();
                setActionMenu(null);
            }
        } catch {
            toast.error('Error al actualizar');
        }
    };

    const deleteLead = async (leadId: string) => {
        if (!confirm('¿Eliminar este contacto permanentemente?')) return;
        try {
            await fetch(`${API}/leads/${leadId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            toast.success('Contacto eliminado');
            fetchLeads();
            if (selectedLead?.id === leadId) setSelectedLead(null);
        } catch {
            toast.error('Error al eliminar');
        }
    };

    const timeAgo = (date: string) => {
        const diff = Date.now() - new Date(date).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Ahora';
        if (mins < 60) return `Hace ${mins}m`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `Hace ${hrs}h`;
        const days = Math.floor(hrs / 24);
        if (days < 30) return `Hace ${days}d`;
        return new Date(date).toLocaleDateString('es');
    };

    return (
        <AdminLayout>
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Contactos & Leads</h1>
                    <p className="text-gray-500 mt-1 text-sm">
                        Personas que se han comunicado a través de tus formularios · {total} contactos
                    </p>
                </div>
            </div>

            {/* Status Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
                    const count = statusCounts[key] || 0;
                    const isActive = statusFilter === key;
                    return (
                        <button
                            key={key}
                            onClick={() => setStatusFilter(isActive ? 'all' : key)}
                            className={`
                                p-3 rounded-xl border transition-all text-left
                                ${isActive
                                    ? `${cfg.bg} border-current ${cfg.color} shadow-sm`
                                    : 'border-gray-100 bg-white hover:bg-gray-50 text-gray-600'}
                            `}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <cfg.icon className="w-3.5 h-3.5" />
                                <span className="text-[10px] font-black uppercase tracking-wider">{cfg.label}</span>
                            </div>
                            <p className="text-xl font-black">{count}</p>
                        </button>
                    );
                })}
            </div>

            {/* Search */}
            <div className="flex items-center gap-3 mb-6">
                <div className="relative flex-1 max-w-md">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por nombre o email..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
                    />
                </div>
                {statusFilter !== 'all' && (
                    <button
                        onClick={() => setStatusFilter('all')}
                        className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-200 transition-all"
                    >
                        <Filter className="w-3.5 h-3.5" />
                        Limpiar filtro
                    </button>
                )}
            </div>

            {/* Main Layout: Table + Detail Panel */}
            <div className="flex gap-6">
                {/* Leads Table */}
                <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden transition-all ${selectedLead ? 'w-[60%]' : 'w-full'}`}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                    <th className="p-4">Contacto</th>
                                    <th className="p-4">Asunto</th>
                                    <th className="p-4">Fuente</th>
                                    <th className="p-4">Estado</th>
                                    <th className="p-4">Fecha</th>
                                    <th className="p-4 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loading ? (
                                    <tr><td colSpan={6} className="p-12 text-center text-gray-400">
                                        <div className="inline-block w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                                    </td></tr>
                                ) : leads.length === 0 ? (
                                    <tr><td colSpan={6} className="p-12 text-center">
                                        <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                            <Users className="w-8 h-8 text-gray-300" />
                                        </div>
                                        <p className="text-gray-500 font-bold">No hay contactos aún</p>
                                        <p className="text-gray-400 text-sm mt-1">Los formularios de tu sitio web aún no han recibido envíos.</p>
                                    </td></tr>
                                ) : leads.map(lead => {
                                    const st = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new;
                                    const isSelected = selectedLead?.id === lead.id;
                                    return (
                                        <tr
                                            key={lead.id}
                                            onClick={() => setSelectedLead(lead)}
                                            className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50/50' : 'hover:bg-gray-50/50'}`}
                                        >
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-xs ${lead.status === 'new' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                                                        {lead.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-900">{lead.name}</p>
                                                        <p className="text-[11px] text-gray-400">{lead.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm text-gray-600 max-w-[160px] truncate">{lead.subject || '—'}</td>
                                            <td className="p-4">
                                                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                                    {SOURCE_LABELS[lead.source] || lead.source}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${st.bg} ${st.color}`}>
                                                    <st.icon className="w-3 h-3" />
                                                    {st.label}
                                                </span>
                                            </td>
                                            <td className="p-4 text-xs text-gray-400 whitespace-nowrap">{timeAgo(lead.createdAt)}</td>
                                            <td className="p-4 relative">
                                                <button
                                                    onClick={e => { e.stopPropagation(); setActionMenu(actionMenu === lead.id ? null : lead.id); }}
                                                    className="p-1.5 text-gray-300 hover:text-gray-500 hover:bg-gray-100 rounded-lg transition-all"
                                                >
                                                    <MoreHorizontal className="w-4 h-4" />
                                                </button>
                                                {actionMenu === lead.id && (
                                                    <div className="absolute right-4 top-10 bg-white border border-gray-200 rounded-xl shadow-xl z-50 w-48 py-1 animate-in fade-in">
                                                        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                                                            <button
                                                                key={key}
                                                                onClick={e => { e.stopPropagation(); updateStatus(lead.id, key); }}
                                                                className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold ${lead.status === key ? cfg.color + ' ' + cfg.bg : 'text-gray-600 hover:bg-gray-50'} transition-colors`}
                                                            >
                                                                <cfg.icon className="w-3.5 h-3.5" />
                                                                {cfg.label}
                                                            </button>
                                                        ))}
                                                        <div className="border-t border-gray-100 my-1" />
                                                        <button
                                                            onClick={e => { e.stopPropagation(); deleteLead(lead.id); }}
                                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                            Eliminar
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Detail Panel */}
                {selectedLead && (
                    <div className="w-[40%] bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sticky top-6 self-start" style={{ animation: 'slideInRight 0.25s ease-out' }}>
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white font-black text-lg">
                                    {selectedLead.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h3 className="text-lg font-black text-gray-900">{selectedLead.name}</h3>
                                    <p className="text-xs text-gray-400">{timeAgo(selectedLead.createdAt)}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedLead(null)} className="p-1.5 text-gray-300 hover:text-gray-500 hover:bg-gray-50 rounded-lg transition-all">
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Contact Info */}
                        <div className="space-y-3 mb-6">
                            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                <Mail className="w-4 h-4 text-gray-400" />
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">Email</p>
                                    <a href={`mailto:${selectedLead.email}`} className="text-sm font-bold text-blue-600 hover:underline">{selectedLead.email}</a>
                                </div>
                            </div>
                            {selectedLead.phone && (
                                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                    <Phone className="w-4 h-4 text-gray-400" />
                                    <div>
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">Teléfono</p>
                                        <a href={`tel:${selectedLead.phone}`} className="text-sm font-bold text-gray-700">{selectedLead.phone}</a>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Metadata: Club & Role */}
                        {selectedLead.metadata && (typeof selectedLead.metadata === 'object' || typeof selectedLead.metadata === 'string') && (() => {
                            const meta = typeof selectedLead.metadata === 'string' ? JSON.parse(selectedLead.metadata) : selectedLead.metadata;
                            return (
                                <div className="grid grid-cols-2 gap-3 mb-6">
                                    {meta.clubName && (
                                        <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                                            <p className="text-[9px] font-black text-blue-400 uppercase tracking-wider mb-1">Club Rotario</p>
                                            <p className="text-xs font-bold text-blue-900">{meta.clubName}</p>
                                        </div>
                                    )}
                                    {meta.role && (
                                        <div className="bg-violet-50/50 p-3 rounded-xl border border-violet-100">
                                            <p className="text-[9px] font-black text-violet-400 uppercase tracking-wider mb-1">Cargo / Rol</p>
                                            <p className="text-xs font-bold text-violet-900">{meta.role}</p>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Subject */}
                        {selectedLead.subject && (
                            <div className="mb-4">
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Asunto</p>
                                <p className="text-sm font-bold text-gray-700">{selectedLead.subject}</p>
                            </div>
                        )}

                        {/* Message */}
                        {selectedLead.message && (
                            <div className="mb-6">
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Mensaje</p>
                                <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 leading-relaxed max-h-40 overflow-y-auto border border-gray-100 italic">
                                    "{selectedLead.message}"
                                </div>
                            </div>
                        )}

                        {/* Files / Attachments */}
                        {selectedLead.metadata && (() => {
                            const meta = typeof selectedLead.metadata === 'string' ? JSON.parse(selectedLead.metadata) : selectedLead.metadata;
                            const files = meta.files || [];
                            if (files.length === 0) return null;
                            return (
                                <div className="mb-6">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Archivos Adjuntos ({files.length})</p>
                                    <div className="space-y-2">
                                        {files.map((file: any, idx: number) => (
                                            <a 
                                                key={idx} 
                                                href={file.url} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-3 p-2.5 bg-white border border-gray-100 rounded-xl hover:bg-gray-50 hover:border-blue-200 transition-all group"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-500">
                                                    {file.mimetype?.includes('video') ? <ArrowUpRight className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] font-bold text-gray-700 truncate">{file.originalName}</p>
                                                    <p className="text-[9px] text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB · {file.mimetype?.split('/')[1]?.toUpperCase()}</p>
                                                </div>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Status */}
                        <div className="mb-6">
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Cambiar estado</p>
                            <div className="flex flex-wrap gap-1.5">
                                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                                    <button
                                        key={key}
                                        onClick={() => updateStatus(selectedLead.id, key)}
                                        className={`
                                            flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all
                                            ${selectedLead.status === key ? `${cfg.bg} ${cfg.color} ring-1 ring-current` : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}
                                        `}
                                    >
                                        <cfg.icon className="w-3 h-3" />
                                        {cfg.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Source & Date */}
                        <div className="pt-4 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400 font-bold">
                            <span className="flex items-center gap-1">
                                <ArrowUpRight className="w-3 h-3" />
                                {SOURCE_LABELS[selectedLead.source] || selectedLead.source}
                            </span>
                            <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(selectedLead.createdAt).toLocaleString('es')}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes slideInRight {
                    from { opacity: 0; transform: translateX(12px); }
                    to { opacity: 1; transform: translateX(0); }
                }
            `}</style>
        </AdminLayout>
    );
};

export default LeadsManagement;
