import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../../hooks/useAuth';
import { Search, Plus, Filter, MoreHorizontal, UserCheck, Tag, X, List as ListIcon, UploadCloud, Pencil, Trash2, Eye, ArrowLeft, Loader2, Users } from 'lucide-react';
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
    const [tags, setTags] = useState([]);
    const [showContactModal, setShowContactModal] = useState(false);
    const [editingContactId, setEditingContactId] = useState<string | null>(null);
    const [showImportWizard, setShowImportWizard] = useState(false);
    
    // Audience Meta state
    const [audienceMeta, setAudienceMeta] = useState<any>(null);
    const [audienceLoading, setAudienceLoading] = useState(false);

    // Pagination state
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalContacts, setTotalContacts] = useState(0);

    // Bulk actions state
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isAllFilteredSelected, setIsAllFilteredSelected] = useState(false);
    const [bulkActionType, setBulkActionType] = useState<string | null>(null);
    const [showBulkActionModal, setShowBulkActionModal] = useState(false);

    useEffect(() => {
        setPage(1);
        fetchContacts(1);
        fetchTags();
        if (audienceType && audienceId) {
            fetchAudienceMeta();
        }
    }, [audienceType, audienceId]);

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

    const fetchContacts = async (pageNumber = page) => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: pageNumber.toString(),
                limit: '50'
            });
            if (search) params.append('search', search);
            if (audienceType === 'list' && audienceId) params.append('lists', audienceId);
            if (audienceType === 'tag' && audienceId) params.append('tags', audienceId);

            const res = await fetch(`${API}/crm/contacts?${params.toString()}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setContacts(data.contacts);
                setTotalPages(data.totalPages);
                setTotalContacts(data.total);
                setPage(data.page);
            }
        } catch (error) {
            toast.error('Error cargando contactos');
        } finally {
            setLoading(false);
        }
    };

    // Helper para limpiar selección si cambian filtros o página (opcional, o mantenerlo)
    useEffect(() => {
        if (!isAllFilteredSelected) {
            setSelectedIds([]);
        }
    }, [page, search]);

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

    const fetchTags = async () => {
        try {
            const res = await fetch(`${API}/crm/tags`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) setTags(await res.json());
        } catch (error) {
            console.error(error);
        }
    };

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
                            
                            <div className="grid grid-cols-4 gap-4">
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

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {/* Toolbar */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar nombre, correo o teléfono..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && fetchContacts()}
                            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-rotary-blue"
                        />
                    </div>
                    <button className="px-3 py-2 border border-gray-200 bg-white rounded-lg text-sm font-bold text-gray-600 flex items-center gap-2 hover:bg-gray-50">
                        <Filter className="w-4 h-4" /> Filtros
                    </button>
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

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
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
                            <th className="p-4 min-w-[200px]">Contacto</th>
                            <th className="p-4 min-w-[150px]">WhatsApp</th>
                            <th className="p-4 min-w-[200px]">Correo Electrónico</th>
                            <th className="p-4 min-w-[150px]">Club</th>
                            <th className="p-4 min-w-[200px]">Etiquetas</th>
                            <th className="p-4 min-w-[120px]">Estado</th>
                            <th className="p-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-sm">
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="p-8 text-center text-gray-400">
                                    <div className="animate-pulse flex flex-col items-center gap-2">
                                        <div className="h-4 w-32 bg-gray-200 rounded"></div>
                                        <div className="h-4 w-48 bg-gray-100 rounded"></div>
                                    </div>
                                </td>
                            </tr>
                        ) : contacts.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="p-12 text-center">
                                    <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <UserCheck className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-1">No hay contactos</h3>
                                    <p className="text-gray-500 mb-4">Agrega tu primer contacto para comenzar.</p>
                                </td>
                            </tr>
                        ) : contacts.map((c: any) => (
                            <tr key={c.id} className={`hover:bg-gray-50/50 transition-colors group ${selectedIds.includes(c.id) || isAllFilteredSelected ? 'bg-blue-50/20' : ''}`}>
                                <td className="p-4">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedIds.includes(c.id) || isAllFilteredSelected}
                                        onChange={(e) => handleSelectContact(c.id, e.target.checked)}
                                        className="rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue" 
                                    />
                                </td>
                                <td className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center flex-shrink-0">
                                            {c.name.charAt(0)}{c.lastName ? c.lastName.charAt(0) : ''}
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-900">{c.name} {c.lastName}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="p-4 text-gray-600">{formatPhoneDisplay(c.phone)}</td>
                                <td className="p-4 text-gray-600">{c.email || '-'}</td>
                                <td className="p-4 text-gray-600 font-medium">{c.club?.name || 'Club Principal'}</td>
                                <td className="p-4">
                                    <div className="flex flex-wrap gap-1">
                                        {c.tags && c.tags.map((t: any) => (
                                            <span key={t.id} style={{ backgroundColor: `${t.color}20`, color: t.color }} className="px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">
                                                {t.name}
                                            </span>
                                        ))}
                                        {(!c.tags || c.tags.length === 0) && (
                                            <span className="text-xs text-gray-400 italic">Sin etiquetas</span>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-bold ${
                                        c.status === 'subscribed' ? 'bg-emerald-50 text-emerald-700' :
                                        c.status === 'unsubscribed' ? 'bg-red-50 text-red-700' :
                                        'bg-gray-100 text-gray-700'
                                    }`}>
                                        {c.status === 'subscribed' ? 'Suscrito' : c.status === 'unsubscribed' ? 'Desuscrito' : c.status}
                                    </span>
                                </td>
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
                                                <Eye className="w-4 h-4" /> Visualizar / Editar
                                            </DropdownMenuItem>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem onClick={() => { setSelectedIds([c.id]); handleActionSelect('delete'); }} className="cursor-pointer gap-2 text-red-600 focus:bg-red-50 focus:text-red-700">
                                                <Trash2 className="w-4 h-4" /> Eliminar Contacto
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            
            {/* Pagination Controls */}
            {!loading && totalContacts > 0 && (
                <div className="p-4 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500 bg-gray-50">
                    <span>Mostrando {contacts.length} de {totalContacts} contactos</span>
                    <div className="flex items-center gap-4">
                        <span className="font-medium">Página {page} de {totalPages}</span>
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
                currentFilterPayload={{ search, tags: audienceType === 'tag' ? [audienceId] : undefined, lists: audienceType === 'list' ? [audienceId] : undefined }}
                onSuccess={() => {
                    setSelectedIds([]);
                    setIsAllFilteredSelected(false);
                    fetchContacts();
                }}
            />

            {showContactModal && (
                <ContactModal 
                    contactId={editingContactId} 
                    onClose={() => setShowContactModal(false)} 
                    onSaved={fetchContacts} 
                />
            )}

            {showImportWizard && (
                <ImportWizard 
                    onClose={() => setShowImportWizard(false)} 
                    onSuccess={fetchContacts} 
                />
            )}
        </BulkProcessingProvider>
    );
}
