import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, Trash2, GripVertical, Settings, Database, Server } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../../hooks/useAuth';
import CustomFieldModal from './CustomFieldModal';

const API = import.meta.env.VITE_API_URL || '/api';

export default function CustomFieldsManager() {
    const { token } = useAuth();
    const [fields, setFields] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [showFieldModal, setShowFieldModal] = useState(false);
    const [editingField, setEditingField] = useState(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [resFields, resGroups] = await Promise.all([
                fetch(`${API}/crm/custom-fields`, { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch(`${API}/crm/custom-field-groups`, { headers: { 'Authorization': `Bearer ${token}` } })
            ]);
            
            if (resFields.ok) setFields(await resFields.json());
            if (resGroups.ok) setGroups(await resGroups.json());
        } catch (error) {
            console.error('Error:', error);
            toast.error('Error cargando campos');
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteField = async (id: string) => {
        if (!confirm('¿Seguro que deseas eliminar este campo? Se borrarán todos los valores asociados en los contactos.')) return;
        try {
            const res = await fetch(`${API}/crm/custom-fields/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                toast.success('Campo eliminado');
                fetchData();
            }
        } catch (error) {
            toast.error('Error eliminando campo');
        }
    };

    const getTypeBadge = (type: string) => {
        const colors: Record<string, string> = {
            text: 'bg-blue-100 text-blue-700',
            textarea: 'bg-indigo-100 text-indigo-700',
            select: 'bg-purple-100 text-purple-700',
            multiselect: 'bg-fuchsia-100 text-fuchsia-700',
            checkbox: 'bg-emerald-100 text-emerald-700',
            date: 'bg-orange-100 text-orange-700',
            number: 'bg-cyan-100 text-cyan-700'
        };
        const color = colors[type] || 'bg-gray-100 text-gray-700';
        return <span className={`px-2 py-1 rounded text-xs font-bold ${color}`}>{type.toUpperCase()}</span>;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Database className="w-6 h-6 text-rotary-blue" />
                        Campos Personalizados
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Configura campos adicionales para almacenar datos específicos de tus contactos</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => { setEditingField(null); setShowFieldModal(true); }} className="bg-rotary-blue hover:bg-sky-800 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Añadir Campo
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                    <div className="relative">
                        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input 
                            type="text" 
                            placeholder="Buscar campos..." 
                            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-rotary-blue w-64 bg-white outline-none"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="text-xs uppercase bg-gray-50 text-gray-700 font-bold border-b border-gray-100">
                            <tr>
                                <th className="px-6 py-4 w-10"></th>
                                <th className="px-6 py-4">Label</th>
                                <th className="px-6 py-4">Key</th>
                                <th className="px-6 py-4">Tipo</th>
                                <th className="px-6 py-4">Grupo</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading ? (
                                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Cargando campos...</td></tr>
                            ) : fields.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-12">
                                        <div className="flex flex-col items-center">
                                            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 text-rotary-blue">
                                                <Server className="w-8 h-8" />
                                            </div>
                                            <p className="text-gray-900 font-bold">No hay campos personalizados</p>
                                            <p className="text-gray-500 text-sm mt-1 mb-4">Comienza añadiendo campos extra como Distrito, Tipo de Membresía, etc.</p>
                                            <button onClick={() => { setEditingField(null); setShowFieldModal(true); }} className="text-rotary-blue font-bold text-sm bg-blue-50 px-4 py-2 rounded-lg hover:bg-blue-100 transition-colors">
                                                + Añadir Primer Campo
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ) : fields.map((field: any) => (
                                <tr key={field.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-6 py-4 text-gray-300 cursor-grab hover:text-gray-500">
                                        <GripVertical className="w-4 h-4" />
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-bold text-gray-900">{field.label}</div>
                                        {field.required && <span className="text-[10px] text-red-500 font-bold uppercase mt-1 block">Requerido</span>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <code className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">{field.key}</code>
                                    </td>
                                    <td className="px-6 py-4">
                                        {getTypeBadge(field.type)}
                                    </td>
                                    <td className="px-6 py-4 text-gray-500 text-sm">
                                        {field.group?.name || <span className="italic text-gray-400">General</span>}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`w-2 h-2 rounded-full inline-block mr-2 ${field.status === 'active' ? 'bg-emerald-500' : 'bg-gray-400'}`}></span>
                                        <span className="capitalize">{field.status}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => { setEditingField(field); setShowFieldModal(true); }} className="p-2 text-gray-400 hover:text-rotary-blue hover:bg-blue-50 rounded-lg transition-colors">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleDeleteField(field.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {showFieldModal && (
                <CustomFieldModal 
                    onClose={() => setShowFieldModal(false)} 
                    onSaved={() => { setShowFieldModal(false); fetchData(); }} 
                    existingField={editingField}
                    groups={groups}
                />
            )}
        </div>
    );
}
