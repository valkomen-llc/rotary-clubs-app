import React, { useState, useEffect } from 'react';
import { X, Plus, User, MapPin, Tag, List as ListIcon, Check, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

export default function ContactModal({ onClose, onSaved, contactId }: { onClose: () => void, onSaved: () => void, contactId?: string }) {
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    const [isLoadingContact, setIsLoadingContact] = useState(!!contactId);
    
    const [formData, setFormData] = useState({
        prefix: '', name: '', lastName: '', email: '', phone: '',
        birthDate: '', title: '', company: '', website: '',
        address: '', city: '', district: '', country: '',
        status: 'subscribed'
    });

    const [showAddress, setShowAddress] = useState(false);
    const [showCustom, setShowCustom] = useState(false);
    
    // Selectors
    const [availableLists, setAvailableLists] = useState([]);
    const [availableTags, setAvailableTags] = useState([]);
    const [availableCustomFields, setAvailableCustomFields] = useState<any[]>([]);
    
    const [selectedLists, setSelectedLists] = useState<string[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [customFieldValues, setCustomFieldValues] = useState<Record<string, any>>({});

    const [newListName, setNewListName] = useState('');
    const [newTagName, setNewTagName] = useState('');
    const [isCreatingList, setIsCreatingList] = useState(false);
    const [isCreatingTag, setIsCreatingTag] = useState(false);

    useEffect(() => {
        if (token) {
            fetchMetadata();
            if (contactId) {
                fetchContact();
            }
        }
    }, [token, contactId]);

    const fetchContact = async () => {
        try {
            const res = await fetch(`${API}/crm/contacts/${contactId}`, { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.ok) {
                const data = await res.json();
                setFormData({
                    prefix: data.prefix || '', name: data.name || '', lastName: data.lastName || '', 
                    email: data.email || '', phone: data.phone || '', birthDate: data.birthDate ? data.birthDate.split('T')[0] : '', 
                    title: data.title || '', company: data.company || '', website: data.website || '',
                    address: data.address || '', city: data.city || '', district: data.district || '', country: data.country || '',
                    status: data.status || 'subscribed'
                });
                if (data.address || data.city || data.country) setShowAddress(true);
                
                setSelectedLists(data.lists ? data.lists.map((l: any) => l.id || l) : []);
                setSelectedTags(data.tags ? data.tags.map((t: any) => t.id || t) : []);
                
                if (data.customFields && data.customFields.length > 0) {
                    setShowCustom(true);
                    const cvs: Record<string, any> = {};
                    data.customFields.forEach((cf: any) => cvs[cf.fieldId] = cf.value);
                    setCustomFieldValues(cvs);
                }
            }
        } catch (error) {
            console.error('Error fetching contact', error);
        } finally {
            setIsLoadingContact(false);
        }
    };

    const fetchMetadata = async () => {
        if (!token) return;
        try {
            const [resLists, resTags, resFields] = await Promise.all([
                fetch(`${API}/crm/lists`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${API}/crm/tags`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${API}/crm/custom-fields`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);
            if (resLists.ok) setAvailableLists(await resLists.json());
            if (resTags.ok) setAvailableTags(await resTags.json());
            if (resFields.ok) setAvailableCustomFields(await resFields.json());
        } catch (e) {
            console.error('Error fetching metadata:', e);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleCustomFieldChange = (fieldId: string, value: any) => {
        setCustomFieldValues({ ...customFieldValues, [fieldId]: value });
    };

    const handleSubmit = async (e: React.FormEvent, createAnother = false) => {
        e.preventDefault();
        if (!formData.email && !formData.phone) {
            toast.error('El contacto debe tener al menos correo o teléfono');
            return;
        }

        setLoading(true);
        try {
            // Transformar objecto customFieldValues a array para la API
            const customFieldsArray = Object.keys(customFieldValues)
                .filter(id => customFieldValues[id] !== '' && customFieldValues[id] !== null)
                .map(id => ({
                    fieldId: id,
                    value: String(customFieldValues[id])
                }));

            const payload = {
                ...formData,
                lists: selectedLists,
                tags: selectedTags,
                customFields: customFieldsArray
            };

            const url = contactId ? `${API}/crm/contacts/${contactId}` : `${API}/crm/contacts`;
            const method = contactId ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const error = await res.json();
                toast.error(error.error || 'Error al guardar el contacto');
                return;
            }

            toast.success(contactId ? 'Contacto actualizado' : 'Contacto creado');
            onSaved();
            if (createAnother && !contactId) {
                setFormData({ ...formData, name: '', lastName: '', email: '', phone: '' });
                setSelectedLists([]);
                setSelectedTags([]);
                setCustomFieldValues({});
            } else {
                onSaved();
            }
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const toggleSelection = (id: string, current: string[], setter: any) => {
        if (current.includes(id)) {
            setter(current.filter(i => i !== id));
        } else {
            setter([...current, id]);
        }
    };

    const createNewList = async () => {
        if (!newListName.trim()) return;
        setIsCreatingList(true);
        try {
            const res = await fetch(`${API}/crm/lists`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name: newListName, color: '#3B82F6' })
            });
            const data = await res.json();
            if (res.ok) {
                setAvailableLists([...availableLists, data] as any);
                setSelectedLists([...selectedLists, data.id]);
                setNewListName('');
                toast.success('Lista creada');
            } else throw new Error(data.error);
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setIsCreatingList(false);
        }
    };

    const createNewTag = async () => {
        if (!newTagName.trim()) return;
        setIsCreatingTag(true);
        try {
            const res = await fetch(`${API}/crm/tags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ name: newTagName, color: '#10B981' })
            });
            const data = await res.json();
            if (res.ok) {
                setAvailableTags([...availableTags, data] as any);
                setSelectedTags([...selectedTags, data.id]);
                setNewTagName('');
                toast.success('Etiqueta creada');
            } else throw new Error(data.error);
        } catch (e: any) {
            toast.error(e.message);
        } finally {
            setIsCreatingTag(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
                    <h2 className="text-xl font-bold text-gray-900">{contactId ? 'Editar contacto' : 'Añadir un nuevo contacto'}</h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {isLoadingContact ? (
                    <div className="flex-1 p-12 flex flex-col items-center justify-center">
                        <div className="w-8 h-8 border-4 border-rotary-blue border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-sm text-gray-500">Cargando datos del contacto...</p>
                    </div>
                ) : (
                <>
                <div className="overflow-y-auto flex-1 p-6 space-y-8">
                    {/* INFO BASICA */}
                    <section>
                        <h3 className="text-sm font-bold text-gray-900 mb-4">Información básica</h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Prefijo</label>
                                <select name="prefix" value={formData.prefix} onChange={handleChange} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none transition-all">
                                    <option value="">Select</option>
                                    <option value="Mr.">Mr.</option>
                                    <option value="Mrs.">Mrs.</option>
                                    <option value="Ms.">Ms.</option>
                                    <option value="Dr.">Dr.</option>
                                </select>
                            </div>
                            <div className="md:col-span-1">
                                <label className="block text-xs font-bold text-gray-700 mb-1">Nombre</label>
                                <input type="text" name="name" value={formData.name} onChange={handleChange} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none transition-all" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-gray-700 mb-1">Apellido(s)</label>
                                <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none transition-all" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1"><span className="text-red-500">*</span> Correo electrónico</label>
                                <input type="email" name="email" value={formData.email} onChange={handleChange} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none transition-all" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Teléfono</label>
                                <input type="text" name="phone" value={formData.phone} onChange={handleChange} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none transition-all" />
                            </div>
                        </div>
                    </section>

                    {/* EXPANDIBLES */}
                    <div className="space-y-4 border-t border-gray-100 pt-6">
                        {/* Dirección */}
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-700 hover:text-rotary-blue transition-colors w-fit">
                            <input type="checkbox" checked={showAddress} onChange={e => setShowAddress(e.target.checked)} className="rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue" />
                            Añadir la información de la dirección
                        </label>
                        {showAddress && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6 animate-in slide-in-from-top-2">
                                <div className="md:col-span-2">
                                    <input type="text" name="address" placeholder="Dirección completa" value={formData.address} onChange={handleChange} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none" />
                                </div>
                                <div>
                                    <input type="text" name="city" placeholder="Ciudad" value={formData.city} onChange={handleChange} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none" />
                                </div>
                                <div>
                                    <input type="text" name="country" placeholder="País" value={formData.country} onChange={handleChange} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none" />
                                </div>
                            </div>
                        )}
                        
                        {/* Campos Personalizados */}
                        <label className="flex items-center gap-2 cursor-pointer text-sm font-bold text-gray-700 hover:text-rotary-blue transition-colors w-fit">
                            <input type="checkbox" checked={showCustom} onChange={e => setShowCustom(e.target.checked)} className="rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue" />
                            Añadir datos personalizados ({availableCustomFields.length} disponibles)
                        </label>
                        {showCustom && (
                            <div className="pl-6 animate-in slide-in-from-top-2">
                                {availableCustomFields.length === 0 ? (
                                    <p className="text-xs text-gray-500 italic">No hay campos personalizados creados en el CRM.</p>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {availableCustomFields.map((field: any) => (
                                            <div key={field.id} className="bg-white p-3 rounded border border-gray-100">
                                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                                    {field.label} {field.required && <span className="text-red-500">*</span>}
                                                </label>
                                                {field.type === 'number' ? (
                                                    <input type="number" value={customFieldValues[field.id] || ''} onChange={(e) => handleCustomFieldChange(field.id, e.target.value)} required={field.required} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none" />
                                                ) : field.type === 'date' || field.type === 'datetime' ? (
                                                    <input type={field.type === 'datetime' ? "datetime-local" : "date"} value={customFieldValues[field.id] || ''} onChange={(e) => handleCustomFieldChange(field.id, e.target.value)} required={field.required} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none" />
                                                ) : field.type === 'textarea' ? (
                                                    <textarea value={customFieldValues[field.id] || ''} onChange={(e) => handleCustomFieldChange(field.id, e.target.value)} required={field.required} rows={3} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none resize-none" />
                                                ) : field.type === 'select' ? (
                                                    <select value={customFieldValues[field.id] || ''} onChange={(e) => handleCustomFieldChange(field.id, e.target.value)} required={field.required} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none">
                                                        <option value="">Seleccionar...</option>
                                                        {field.options?.map((opt: any, i: number) => (
                                                            <option key={i} value={opt.value}>{opt.label}</option>
                                                        ))}
                                                    </select>
                                                ) : field.type === 'radio' ? (
                                                    <div className="space-y-1 mt-2">
                                                        {field.options?.map((opt: any, i: number) => (
                                                            <label key={i} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                                                <input type="radio" name={`cf_${field.id}`} value={opt.value} checked={customFieldValues[field.id] === opt.value} onChange={(e) => handleCustomFieldChange(field.id, e.target.value)} className="text-rotary-blue focus:ring-rotary-blue" />
                                                                {opt.label}
                                                            </label>
                                                        ))}
                                                    </div>
                                                ) : field.type === 'checkbox' ? (
                                                    <div className="space-y-1 mt-2">
                                                        {field.options?.map((opt: any, i: number) => {
                                                            const currentValues = customFieldValues[field.id] ? customFieldValues[field.id].split(',') : [];
                                                            return (
                                                                <label key={i} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                                                    <input 
                                                                        type="checkbox" 
                                                                        checked={currentValues.includes(opt.value)} 
                                                                        onChange={(e) => {
                                                                            if (e.target.checked) {
                                                                                handleCustomFieldChange(field.id, [...currentValues, opt.value].join(','));
                                                                            } else {
                                                                                handleCustomFieldChange(field.id, currentValues.filter((v: string) => v !== opt.value).join(','));
                                                                            }
                                                                        }}
                                                                        className="rounded text-rotary-blue focus:ring-rotary-blue" 
                                                                    />
                                                                    {opt.label}
                                                                </label>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                    <input type={field.type === 'url' ? "url" : "text"} value={customFieldValues[field.id] || ''} onChange={(e) => handleCustomFieldChange(field.id, e.target.value)} required={field.required} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* IDENTIFICADORES (LISTAS Y ETIQUETAS INLINE) */}
                    <section className="border-t border-gray-100 pt-6">
                        <h3 className="text-sm font-bold text-gray-900 mb-4">Identificadores</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            
                            {/* Panel de Listas */}
                            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
                                <label className="block text-xs font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                                    <ListIcon className="w-4 h-4 text-rotary-blue" />
                                    Seleccionar Listas
                                </label>
                                <div className="max-h-40 overflow-y-auto space-y-1 mb-4 p-2 bg-white border border-gray-100 rounded-lg">
                                    {availableLists.length === 0 ? (
                                        <p className="text-xs text-gray-400 p-2 text-center">No hay listas disponibles.</p>
                                    ) : availableLists.map((l: any) => (
                                        <label key={l.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer text-gray-700 text-sm transition-colors border border-transparent hover:border-gray-100">
                                            <input type="checkbox" checked={selectedLists.includes(l.id)} onChange={() => toggleSelection(l.id, selectedLists, setSelectedLists)} className="rounded text-rotary-blue w-4 h-4" />
                                            <span className="font-medium flex-1">{l.name}</span>
                                        </label>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={newListName} 
                                        onChange={e => setNewListName(e.target.value)} 
                                        placeholder="Nombre nueva lista..." 
                                        className="flex-1 text-sm p-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none"
                                        onKeyDown={e => e.key === 'Enter' && createNewList()}
                                    />
                                    <button onClick={createNewList} disabled={isCreatingList || !newListName.trim()} className="bg-rotary-blue text-white px-3 font-bold rounded-lg text-xs hover:bg-sky-800 transition-colors disabled:opacity-50">
                                        Crear
                                    </button>
                                </div>
                            </div>

                            {/* Panel de Etiquetas */}
                            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
                                <label className="block text-xs font-bold text-gray-900 uppercase tracking-wide mb-3 flex items-center gap-2">
                                    <Tag className="w-4 h-4 text-emerald-500" />
                                    Seleccionar Etiquetas
                                </label>
                                <div className="max-h-40 overflow-y-auto space-y-1 mb-4 p-2 bg-white border border-gray-100 rounded-lg">
                                    {availableTags.length === 0 ? (
                                        <p className="text-xs text-gray-400 p-2 text-center">No hay etiquetas disponibles.</p>
                                    ) : availableTags.map((t: any) => (
                                        <label key={t.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer text-gray-700 text-sm transition-colors border border-transparent hover:border-gray-100">
                                            <input type="checkbox" checked={selectedTags.includes(t.id)} onChange={() => toggleSelection(t.id, selectedTags, setSelectedTags)} className="rounded text-rotary-blue w-4 h-4" />
                                            <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: t.color }}></div>
                                            <span className="font-medium flex-1">{t.name}</span>
                                        </label>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={newTagName} 
                                        onChange={e => setNewTagName(e.target.value)} 
                                        placeholder="Nombre nueva etiqueta..." 
                                        className="flex-1 text-sm p-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                                        onKeyDown={e => e.key === 'Enter' && createNewTag()}
                                    />
                                    <button onClick={createNewTag} disabled={isCreatingTag || !newTagName.trim()} className="bg-emerald-600 text-white px-3 font-bold rounded-lg text-xs hover:bg-emerald-700 transition-colors disabled:opacity-50">
                                        Crear
                                    </button>
                                </div>
                            </div>

                            {/* Estado */}
                            <div className="md:col-span-2 bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-center gap-4 justify-end">
                                <label className="text-sm font-bold text-gray-700"><span className="text-red-500">*</span> Estado de Suscripción:</label>
                                <select name="status" value={formData.status} onChange={handleChange} className="w-48 p-2 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-rotary-blue outline-none">
                                    <option value="subscribed">Suscrito</option>
                                    <option value="pending">Pendiente</option>
                                    <option value="unsubscribed">No suscrito</option>
                                </select>
                            </div>

                        </div>
                    </section>
                </div>

                <div className="p-4 border-t border-gray-100 bg-white flex items-center justify-end gap-3">
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm font-bold transition-colors">
                        Cancelar
                    </button>
                    {!contactId && (
                        <button onClick={(e) => handleSubmit(e, true)} disabled={loading} className="text-rotary-blue hover:bg-blue-50 px-4 py-2 text-sm font-bold rounded-lg transition-colors border border-transparent hover:border-blue-100">
                            Crear y añadir otro
                        </button>
                    )}
                    <button onClick={(e) => handleSubmit(e, false)} disabled={loading} className="bg-rotary-blue hover:bg-sky-800 text-white px-8 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50">
                        {loading ? 'Guardando...' : contactId ? 'Guardar Cambios' : 'Guardar Contacto'}
                    </button>
                </div>
                </>
                )}
            </div>
        </div>
    );
}
