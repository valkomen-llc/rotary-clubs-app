import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import {
  Search, Plus, Filter, MoreHorizontal, UserCheck, Tag, X, List as ListIcon,
  UploadCloud, Pencil, Trash2, Eye, ArrowLeft, Loader2, Users, Columns3,
  RotateCcw, SlidersHorizontal, Building2, Globe2, BadgeCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../ui/dropdown-menu";
import BulkActionsBar from './BulkActionsBar';
import BulkActionModals from './BulkActionModals';
import { BulkProcessingProvider } from './BulkProcessingProvider';
import ContactModal from './ContactModal';
import ImportWizard from './ImportWizard';
import { formatPhoneDisplay } from '../../../../lib/utils';

const API = import.meta.env.VITE_API_URL || '/api';

const STATUS_BADGE: Record<string, string> = {
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  ambiguous: 'bg-amber-50 text-amber-700 border-amber-200',
  pending: 'bg-orange-50 text-orange-700 border-orange-200',
  unreconciled: 'bg-sky-50 text-sky-700 border-sky-200',
  unlinked: 'bg-gray-50 text-gray-600 border-gray-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};

const PLATFORM_BADGE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  inactive: 'bg-gray-100 text-gray-600 border-gray-200',
  unverified: 'bg-slate-50 text-slate-600 border-slate-200',
};

const ALL_COLUMNS = [
  { key: 'contact', label: 'Contacto', locked: true },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Correo' },
  { key: 'club', label: 'Club oficial' },
  { key: 'district', label: 'Distrito' },
  { key: 'role', label: 'Cargo' },
  { key: 'institutional', label: 'Conciliación' },
  { key: 'platform', label: 'Club Platform' },
  { key: 'completion', label: 'Completitud' },
  { key: 'tags', label: 'Etiquetas' },
  { key: 'status', label: 'Estado CRM' },
];

const DEFAULT_COLUMNS: Record<string, boolean> = {
  contact: true,
  whatsapp: true,
  email: true,
  club: true,
  district: true,
  role: true,
  institutional: true,
  platform: false,
  completion: false,
  tags: true,
  status: true,
};

const EMPTY_FILTERS = {
  institutionalStatus: '',
  institutionalRole: '',
  districtNumber: '',
  platformStatus: '',
  completionMin: '',
  completionMax: '',
  institutionalSegment: '',
  hasEmail: '',
  hasPhone: '',
};

function readColumns() {
  try {
    const stored = JSON.parse(localStorage.getItem('crm.institutional.columns') || '{}');
    return { ...DEFAULT_COLUMNS, ...stored, contact: true };
  } catch {
    return { ...DEFAULT_COLUMNS };
  }
}

export default function ContactsManager({
    audienceType,
    audienceId,
    onBack
}: {
    audienceType?: 'list' | 'tag';
    audienceId?: string;
    onBack?: () => void;
} = {}) {
    const { token } = useAuth();
    const [contacts, setContacts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showContactModal, setShowContactModal] = useState(false);
    const [editingContactId, setEditingContactId] = useState<string | null>(null);
    const [showImportWizard, setShowImportWizard] = useState(false);

    // Audience Meta state
    const [audienceMeta, setAudienceMeta] = useState<any>(null);
    const [audienceLoading, setAudienceLoading] = useState(false);

    // Institutional filters and catalog
    const [catalog, setCatalog] = useState<any>(null);
    const [filters, setFilters] = useState({ ...EMPTY_FILTERS });
    const [showFilters, setShowFilters] = useState(false);
    const [showColumns, setShowColumns] = useState(false);
    const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(readColumns);

    // Pagination state
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalContacts, setTotalContacts] = useState(0);

    // Bulk actions state
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isAllFilteredSelected, setIsAllFilteredSelected] = useState(false);
    const [bulkActionType, setBulkActionType] = useState<string | null>(null);
    const [showBulkActionModal, setShowBulkActionModal] = useState(false);

    const activeFilterCount = useMemo(
        () => Object.values(filters).filter((value) => value !== '').length,
        [filters]
    );

    useEffect(() => {
        setPage(1);
        fetchContacts(1, filters);
        fetchCatalog();
        if (audienceType && audienceId) {
            fetchAudienceMeta();
        }
    }, [audienceType, audienceId]);

    useEffect(() => {
        localStorage.setItem('crm.institutional.columns', JSON.stringify(visibleColumns));
    }, [visibleColumns]);

    const fetchCatalog = async () => {
        try {
            const res = await fetch(`${API}/crm/institutional/catalog`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setCatalog(await res.json());
        } catch {
            // El listado sigue funcionando sin catálogo: sólo se ocultan filtros.
        }
    };

    const fetchAudienceMeta = async () => {
        setAudienceLoading(true);
        try {
            const endpoint = audienceType === 'list' ? `/crm/lists/${audienceId}` : `/crm/tags/${audienceId}`;
            const res = await fetch(`${API}${endpoint}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                setAudienceMeta(await res.json());
            }
        } catch (error) {
            console.error('Error fetching audience meta:', error);
        } finally {
            setAudienceLoading(false);
        }
    };

    const fetchContacts = async (pageNumber = page, nextFilters = filters) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(pageNumber),
                limit: '50'
            });
            if (search) params.append('search', search);
            if (audienceType === 'list' && audienceId) params.append('lists', audienceId);
            if (audienceType === 'tag' && audienceId) params.append('tags', audienceId);
            Object.entries(nextFilters).forEach(([key, value]) => {
                if (value !== '' && value != null) params.append(key, String(value));
            });

            const res = await fetch(`${API}/crm/contacts?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setContacts(data.contacts);
                setTotalPages(data.totalPages);
                setTotalContacts(data.total);
                setPage(data.page || pageNumber);
            }
        } catch (error) {
            toast.error('Error cargando contactos');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isAllFilteredSelected) {
            setSelectedIds([]);
        }
    }, [page, search]);

    const applyFilters = () => {
        setPage(1);
        setSelectedIds([]);
        setIsAllFilteredSelected(false);
        fetchContacts(1, filters);
    };

    const clearFilters = () => {
        const cleared = { ...EMPTY_FILTERS };
        setFilters(cleared);
        setPage(1);
        setSelectedIds([]);
        setIsAllFilteredSelected(false);
        fetchContacts(1, cleared);
    };

    const handleSelectAllOnPage = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const pageIds = contacts.map((c: any) => c.id);
            setSelectedIds(Array.from(new Set([...selectedIds, ...pageIds])));
        } else {
            const pageIds = contacts.map((c: any) => c.id);
            setSelectedIds(selectedIds.filter(id => !pageIds.includes(id)));
            setIsAllFilteredSelected(false);
        }
    };

    const handleSelectContact = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedIds([...selectedIds, id]);
        } else {
            setSelectedIds(selectedIds.filter(cid => cid !== id));
            setIsAllFilteredSelected(false);
        }
    };

    const handleActionSelect = (action: string) => {
        setBulkActionType(action);
        setShowBulkActionModal(true);
    };

    const isAllOnPageSelected = contacts.length > 0 && contacts.every((c: any) => selectedIds.includes(c.id));

    const renderClub = (c: any) => {
        const inst = c.institutional || {};
        const official = inst.profileName;
        const declared = inst.rawClubName;
        const name = official || declared;
        return (
            <div className="min-w-[170px]">
                <p className={`font-bold flex items-center gap-1.5 ${name ? 'text-gray-800' : 'text-amber-600 italic font-medium'}`}>
                    <Building2 className={`w-3.5 h-3.5 shrink-0 ${name ? 'text-gray-400' : 'text-amber-500'}`} />
                    {name || 'Sin club declarado'}
                </p>
                {official && declared && official !== declared && (
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate" title={declared}>Declarado: {declared}</p>
                )}
                {c.origin?.name && (
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate" title="Organización del CRM, no club de pertenencia">
                        Origen CRM: {c.origin.name}
                    </p>
                )}
            </div>
        );
    };

    const renderInstitutionalStatus = (c: any) => {
        const inst = c.institutional || {};
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${STATUS_BADGE[inst.status] || STATUS_BADGE.unlinked}`}>
                {inst.status === 'confirmed' ? <BadgeCheck className="w-3 h-3" /> : <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />}
                {inst.statusLabel || 'Sin conciliar'}
            </span>
        );
    };

    const renderPlatform = (c: any) => {
        const inst = c.institutional || {};
        const status = inst.platformStatus || 'unverified';
        return (
            <div className="min-w-[130px]">
                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-[10px] font-bold whitespace-nowrap ${PLATFORM_BADGE[status] || PLATFORM_BADGE.unverified}`}>
                    <Globe2 className="w-3 h-3" />
                    {status === 'active' ? 'Activo' : status === 'pending' ? 'En activación' : status === 'inactive' ? 'Inactivo' : 'Sin verificar'}
                </span>
                {inst.completionPercentage != null && (
                    <p className="text-[10px] text-gray-400 mt-1">Directorio: {inst.completionPercentage}%</p>
                )}
            </div>
        );
    };

    const visibleCount = ALL_COLUMNS.filter((column) => visibleColumns[column.key]).length;
    const totalColumns = 2 + visibleCount; // checkbox + columnas + acciones

    return (
        <BulkProcessingProvider>
            {audienceType && audienceLoading && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-6 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-rotary-blue" />
                </div>
            )}

            {audienceType && audienceMeta && !audienceLoading && (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
                    <div className="flex items-start gap-4">
                        <button onClick={onBack} className="mt-1 p-2 bg-gray-50 text-gray-400 hover:text-rotary-blue rounded-lg transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${audienceMeta.tag?.color || audienceMeta.list?.color || '#3B82F6'}20`, color: audienceMeta.tag?.color || audienceMeta.list?.color || '#3B82F6' }}>
                                    {audienceType === 'list' ? <ListIcon className="w-4 h-4" /> : <Tag className="w-4 h-4" />}
                                </div>
                                <h2 className="text-xl font-bold text-gray-900">{audienceMeta.tag?.name || audienceMeta.list?.name}</h2>
                            </div>
                            <p className="text-sm text-gray-500 mb-6">{audienceMeta.tag?.description || audienceMeta.list?.description || 'Sin descripción'}</p>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-gray-50 rounded-xl p-4">
                                    <div className="text-xs font-bold text-gray-500 mb-1 flex items-center gap-2"><Users className="w-3 h-3"/> Total Contactos</div>
                                    <div className="text-2xl font-black text-gray-900">{audienceMeta.stats?.total || 0}</div>
                                </div>
                                <div className="bg-green-50 rounded-xl p-4">
                                    <div className="text-xs font-bold text-green-600 mb-1 flex items-center gap-2"><UserCheck className="w-3 h-3"/> Suscritos</div>
                                    <div className="text-2xl font-black text-green-700">{audienceMeta.stats?.subscribed || 0}</div>
                                </div>
                                <div className="bg-red-50 rounded-xl p-4">
                                    <div className="text-xs font-bold text-red-600 mb-1 flex items-center gap-2"><X className="w-3 h-3"/> No Suscritos</div>
                                    <div className="text-2xl font-black text-red-700">{audienceMeta.stats?.unsubscribed || 0}</div>
                                </div>
                                <div className="bg-amber-50 rounded-xl p-4">
                                    <div className="text-xs font-bold text-amber-600 mb-1 flex items-center gap-2"><Loader2 className="w-3 h-3"/> Pendientes</div>
                                    <div className="text-2xl font-black text-amber-700">{audienceMeta.stats?.pending || 0}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-visible">
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-gray-50/50">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar nombre, correo o teléfono..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && fetchContacts(1)}
                            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-64 max-w-full focus:outline-none focus:ring-2 focus:ring-rotary-blue"
                        />
                    </div>
                    <button
                        onClick={() => setShowFilters((value) => !value)}
                        className={`px-3 py-2 border rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${
                            showFilters || activeFilterCount ? 'border-violet-300 bg-violet-50 text-violet-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        <Filter className="w-4 h-4" /> Filtros
                        {activeFilterCount > 0 && (
                            <span className="min-w-5 h-5 px-1 rounded-full bg-violet-600 text-white text-[10px] flex items-center justify-center">{activeFilterCount}</span>
                        )}
                    </button>
                    <div className="relative">
                        <button
                            onClick={() => setShowColumns((value) => !value)}
                            className="px-3 py-2 border border-gray-200 bg-white rounded-lg text-sm font-bold text-gray-600 flex items-center gap-2 hover:bg-gray-50"
                        >
                            <Columns3 className="w-4 h-4" /> Columnas
                        </button>
                        {showColumns && (
                            <div className="absolute left-0 top-full mt-2 z-30 w-64 rounded-xl border border-gray-200 bg-white shadow-xl p-2">
                                <div className="flex items-center justify-between px-2 py-1">
                                    <span className="text-[10px] font-black uppercase tracking-wide text-gray-400">Columnas visibles</span>
                                    <button onClick={() => setVisibleColumns({ ...DEFAULT_COLUMNS })} className="text-[10px] font-bold text-rotary-blue hover:underline">Restablecer</button>
                                </div>
                                {ALL_COLUMNS.map((column) => (
                                    <label key={column.key} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs ${column.locked ? 'opacity-60' : 'hover:bg-gray-50 cursor-pointer'}`}>
                                        <input
                                            type="checkbox"
                                            disabled={column.locked}
                                            checked={!!visibleColumns[column.key]}
                                            onChange={(e) => setVisibleColumns((current) => ({ ...current, [column.key]: e.target.checked }))}
                                            className="rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue"
                                        />
                                        <span className="font-medium text-gray-700">{column.label}</span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => setShowImportWizard(true)} className="px-4 py-2 border border-gray-200 bg-white rounded-lg text-sm font-bold text-gray-700 flex items-center gap-2 hover:bg-gray-50 transition-colors">
                        <UploadCloud className="w-4 h-4" />
                        Importar
                    </button>
                    <button onClick={() => { setEditingContactId(null); setShowContactModal(true); }} className="bg-rotary-blue hover:bg-sky-800 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors shadow-sm">
                        <Plus className="w-4 h-4" />
                        Añadir Contacto
                    </button>
                </div>
            </div>

            {showFilters && (
                <div className="border-b border-violet-100 bg-violet-50/30 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-black uppercase tracking-wide text-violet-700 flex items-center gap-1.5">
                            <SlidersHorizontal className="w-3.5 h-3.5" /> Filtros institucionales combinables
                        </p>
                        <button onClick={clearFilters} className="text-[11px] font-bold text-gray-500 hover:text-gray-700 flex items-center gap-1">
                            <RotateCcw className="w-3 h-3" /> Limpiar
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        <label className="text-[11px] font-bold text-gray-600">
                            Conciliación
                            <select
                                value={filters.institutionalStatus}
                                onChange={(e) => setFilters({ ...filters, institutionalStatus: e.target.value })}
                                className="mt-1 w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-violet-500"
                            >
                                <option value="">Todas</option>
                                {(catalog?.statuses || []).map((s: any) => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                        </label>
                        <label className="text-[11px] font-bold text-gray-600">
                            Cargo
                            <select
                                value={filters.institutionalRole}
                                onChange={(e) => setFilters({ ...filters, institutionalRole: e.target.value })}
                                className="mt-1 w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-violet-500"
                            >
                                <option value="">Todos</option>
                                {(catalog?.roles || []).map((r: any) => <option key={r.key} value={r.key}>{r.label}</option>)}
                            </select>
                        </label>
                        <label className="text-[11px] font-bold text-gray-600">
                            Distrito
                            <select
                                value={filters.districtNumber}
                                onChange={(e) => setFilters({ ...filters, districtNumber: e.target.value })}
                                className="mt-1 w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-violet-500"
                            >
                                <option value="">Todos</option>
                                {(catalog?.districts || []).map((d: any) => <option key={d.number} value={d.number}>Distrito {d.number}</option>)}
                            </select>
                        </label>
                        <label className="text-[11px] font-bold text-gray-600">
                            Club Platform
                            <select
                                value={filters.platformStatus}
                                onChange={(e) => setFilters({ ...filters, platformStatus: e.target.value })}
                                className="mt-1 w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-violet-500"
                            >
                                <option value="">Todos</option>
                                {(catalog?.platformStatuses || []).map((s: any) => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                        </label>
                        <label className="text-[11px] font-bold text-gray-600">
                            Segmento dinámico
                            <select
                                value={filters.institutionalSegment}
                                onChange={(e) => setFilters({ ...filters, institutionalSegment: e.target.value })}
                                className="mt-1 w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-violet-500"
                            >
                                <option value="">Sin segmento</option>
                                {(catalog?.segments || []).map((s: any) => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                        </label>
                        <label className="text-[11px] font-bold text-gray-600">
                            Completitud mínima
                            <input
                                type="number" min={0} max={100}
                                value={filters.completionMin}
                                onChange={(e) => setFilters({ ...filters, completionMin: e.target.value })}
                                placeholder="0"
                                className="mt-1 w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-violet-500"
                            />
                        </label>
                        <label className="text-[11px] font-bold text-gray-600">
                            Completitud máxima
                            <input
                                type="number" min={0} max={100}
                                value={filters.completionMax}
                                onChange={(e) => setFilters({ ...filters, completionMax: e.target.value })}
                                placeholder="100"
                                className="mt-1 w-full px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-violet-500"
                            />
                        </label>
                        <div className="flex items-end gap-4 pb-1">
                            <label className="flex items-center gap-2 text-[11px] font-bold text-gray-600">
                                <input type="checkbox" checked={filters.hasEmail === 'true'} onChange={(e) => setFilters({ ...filters, hasEmail: e.target.checked ? 'true' : '' })} className="rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
                                Con correo
                            </label>
                            <label className="flex items-center gap-2 text-[11px] font-bold text-gray-600">
                                <input type="checkbox" checked={filters.hasPhone === 'true'} onChange={(e) => setFilters({ ...filters, hasPhone: e.target.checked ? 'true' : '' })} className="rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
                                Con teléfono
                            </label>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button onClick={applyFilters} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-bold hover:bg-violet-700">
                            Aplicar filtros
                        </button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[760px]">
                    <thead>
                        <tr className="bg-white border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
                            <th className="p-4 w-10">
                                <input
                                    type="checkbox"
                                    checked={isAllOnPageSelected || isAllFilteredSelected}
                                    onChange={handleSelectAllOnPage}
                                    className="rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue"
                                />
                            </th>
                            {visibleColumns.contact && <th className="p-4 min-w-[200px]">Contacto</th>}
                            {visibleColumns.whatsapp && <th className="p-4 min-w-[140px]">WhatsApp</th>}
                            {visibleColumns.email && <th className="p-4 min-w-[180px]">Correo Electrónico</th>}
                            {visibleColumns.club && <th className="p-4 min-w-[180px]">Club oficial</th>}
                            {visibleColumns.district && <th className="p-4 min-w-[90px]">Distrito</th>}
                            {visibleColumns.role && <th className="p-4 min-w-[130px]">Cargo</th>}
                            {visibleColumns.institutional && <th className="p-4 min-w-[140px]">Conciliación</th>}
                            {visibleColumns.platform && <th className="p-4 min-w-[140px]">Club Platform</th>}
                            {visibleColumns.completion && <th className="p-4 min-w-[100px]">Completitud</th>}
                            {visibleColumns.tags && <th className="p-4 min-w-[180px]">Etiquetas</th>}
                            {visibleColumns.status && <th className="p-4 min-w-[110px]">Estado CRM</th>}
                            <th className="p-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-sm">
                        {loading ? (
                            <tr>
                                <td colSpan={totalColumns} className="p-8 text-center text-gray-400">
                                    <div className="animate-pulse flex flex-col items-center gap-2">
                                        <div className="h-4 w-32 bg-gray-200 rounded"></div>
                                        <div className="h-4 w-48 bg-gray-100 rounded"></div>
                                    </div>
                                </td>
                            </tr>
                        ) : contacts.length === 0 ? (
                            <tr>
                                <td colSpan={totalColumns} className="p-12 text-center">
                                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <UserCheck className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-1">No hay contactos</h3>
                                    <p className="text-gray-500 mb-4">{activeFilterCount ? 'Ningún contacto cumple los filtros seleccionados.' : 'Agrega tu primer contacto para comenzar.'}</p>
                                    {!!activeFilterCount && (
                                        <button onClick={clearFilters} className="text-sm font-bold text-rotary-blue hover:underline">Limpiar filtros</button>
                                    )}
                                </td>
                            </tr>
                        ) : contacts.map((c: any) => {
                            const inst = c.institutional || {};
                            return (
                                <tr key={c.id} className={`hover:bg-gray-50/50 transition-colors group ${selectedIds.includes(c.id) || isAllFilteredSelected ? 'bg-blue-50/20' : ''}`}>
                                    <td className="p-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(c.id) || isAllFilteredSelected}
                                            onChange={(e) => handleSelectContact(c.id, e.target.checked)}
                                            className="rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue"
                                        />
                                    </td>
                                    {visibleColumns.contact && (
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center flex-shrink-0">
                                                    {c.name.charAt(0)}{c.lastName ? c.lastName.charAt(0) : ''}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-gray-900 truncate">{c.name} {c.lastName}</p>
                                                    {c.title && <p className="text-[11px] text-gray-400 truncate">{c.title}</p>}
                                                </div>
                                            </div>
                                        </td>
                                    )}
                                    {visibleColumns.whatsapp && <td className="p-4 text-gray-600">{formatPhoneDisplay(c.phone)}</td>}
                                    {visibleColumns.email && <td className="p-4 text-gray-600 truncate max-w-[220px]">{c.email || '-'}</td>}
                                    {visibleColumns.club && <td className="p-4">{renderClub(c)}</td>}
                                    {visibleColumns.district && (
                                        <td className="p-4 text-gray-600">
                                            {inst.districtNumber != null ? <span className="font-bold">D{inst.districtNumber}</span> : <span className="text-gray-300">—</span>}
                                        </td>
                                    )}
                                    {visibleColumns.role && (
                                        <td className="p-4">
                                            <span className="text-xs font-semibold text-gray-700">{inst.roleLabel || '—'}</span>
                                            {inst.period && <p className="text-[10px] text-gray-400 mt-0.5">{inst.period}</p>}
                                        </td>
                                    )}
                                    {visibleColumns.institutional && <td className="p-4">{renderInstitutionalStatus(c)}</td>}
                                    {visibleColumns.platform && <td className="p-4">{renderPlatform(c)}</td>}
                                    {visibleColumns.completion && (
                                        <td className="p-4">
                                            {inst.completionPercentage != null ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-14 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                                        <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.min(100, inst.completionPercentage)}%` }} />
                                                    </div>
                                                    <span className="text-[11px] font-bold text-gray-600">{inst.completionPercentage}%</span>
                                                </div>
                                            ) : <span className="text-gray-300">—</span>}
                                        </td>
                                    )}
                                    {visibleColumns.tags && (
                                        <td className="p-4">
                                            <div className="flex flex-wrap gap-1 max-w-[230px]">
                                                {c.tags && c.tags.map((t: any) => (
                                                    <span key={t.id} style={{ backgroundColor: `${t.color}20`, color: t.color }} className="px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap">
                                                        {t.name}
                                                    </span>
                                                ))}
                                                {(!c.tags || c.tags.length === 0) && (
                                                    <span className="text-xs text-gray-400 italic">Sin etiquetas</span>
                                                )}
                                            </div>
                                        </td>
                                    )}
                                    {visibleColumns.status && (
                                        <td className="p-4">
                                            <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold ${
                                                c.status === 'subscribed' ? 'bg-emerald-50 text-emerald-700' :
                                                c.status === 'unsubscribed' ? 'bg-red-50 text-red-700' :
                                                'bg-gray-100 text-gray-700'
                                            }`}>
                                                {c.status === 'subscribed' ? 'Suscrito' : c.status === 'unsubscribed' ? 'Desuscrito' : c.status}
                                            </span>
                                        </td>
                                    )}
                                    <td className="p-4 text-right">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <button className="p-2 text-gray-400 hover:text-rotary-blue hover:bg-blue-50 rounded-lg transition-colors outline-none">
                                                    <MoreHorizontal className="w-4 h-4" />
                                                </button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                                <DropdownMenuItem onClick={() => { setEditingContactId(c.id); setShowContactModal(true); }} className="cursor-pointer gap-2">
                                                    <Pencil className="w-4 h-4" /> Editar Contacto
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => { setEditingContactId(c.id); setShowContactModal(true); }} className="cursor-pointer gap-2">
                                                    <Eye className="w-4 h-4" /> Ficha inteligente
                                                </DropdownMenuItem>
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => { setSelectedIds([c.id]); handleActionSelect('delete'); }} className="cursor-pointer gap-2 text-red-600 focus:bg-red-50 focus:text-red-700">
                                                    <Trash2 className="w-4 h-4" /> Eliminar Contacto
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {!loading && totalContacts > 0 && (
                <div className="p-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-2 text-sm text-gray-500 bg-gray-50">
                    <span>Mostrando {contacts.length} de {totalContacts} contactos</span>
                    <div className="flex items-center gap-4">
                        <span className="font-medium">Página {page} de {totalPages || 1}</span>
                        <div className="flex gap-1">
                            <button
                                onClick={() => fetchContacts(page - 1)}
                                disabled={page <= 1}
                                className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-50 transition-colors"
                            >
                                Anterior
                            </button>
                            <button
                                onClick={() => fetchContacts(page + 1)}
                                disabled={page >= totalPages}
                                className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-50 transition-colors"
                            >
                                Siguiente
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>

            <BulkActionsBar
                selectedCount={selectedIds.length}
                totalFilteredCount={totalContacts}
                isAllFilteredSelected={isAllFilteredSelected}
                onClearSelection={() => setSelectedIds([])}
                onSelectAllFiltered={() => setIsAllFilteredSelected(true)}
                onActionSelect={handleActionSelect}
            />

            <BulkActionModals
                actionType={bulkActionType}
                isOpen={showBulkActionModal}
                onClose={() => setShowBulkActionModal(false)}
                selectedContactIds={selectedIds}
                isAllFilteredSelected={isAllFilteredSelected}
                totalFilteredCount={totalContacts}
                currentFilterPayload={{
                    search,
                    ...(audienceType === 'tag' ? { tags: [audienceId] } : {}),
                    ...(audienceType === 'list' ? { lists: [audienceId] } : {}),
                    ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')),
                }}
                onSuccess={() => {
                    setSelectedIds([]);
                    setIsAllFilteredSelected(false);
                    fetchContacts();
                }}
            />

            {showContactModal && (
                <ContactModal
                    contactId={editingContactId || undefined}
                    onClose={() => setShowContactModal(false)}
                    onSaved={() => fetchContacts()}
                />
            )}

            {showImportWizard && (
                <ImportWizard
                    onClose={() => setShowImportWizard(false)}
                    onSuccess={() => fetchContacts()}
                />
            )}
        </BulkProcessingProvider>
    );
}
