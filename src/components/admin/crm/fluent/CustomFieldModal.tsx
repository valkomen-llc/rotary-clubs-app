import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

export default function CustomFieldModal({ onClose, onSaved, existingField = null, groups = [] }: any) {
    const { token } = useAuth();
    const [loading, setLoading] = useState(false);
    
    const [formData, setFormData] = useState({
        label: '',
        key: '',
        type: 'text',
        required: false,
        status: 'active',
        groupId: '',
        sortOrder: 0
    });

    const [options, setOptions] = useState<any[]>([]);

    useEffect(() => {
        if (existingField) {
            setFormData({
                label: existingField.label,
                key: existingField.key,
                type: existingField.type,
                required: existingField.required,
                status: existingField.status || 'active',
                groupId: existingField.groupId || '',
                sortOrder: existingField.sortOrder || 0
            });
            if (existingField.options && Array.isArray(existingField.options)) {
                setOptions(existingField.options);
            }
        }
    }, [existingField]);

    const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        const key = val.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
        setFormData(prev => ({
            ...prev,
            label: val,
            key: existingField ? prev.key : key // Auto-gen key only if new
        }));
    };

    const handleAddOption = () => {
        setOptions([...options, { label: '', value: '', color: '#3B82F6' }]);
    };

    const handleOptionChange = (index: number, field: string, value: string) => {
        const newOpts = [...options];
        newOpts[index][field] = value;
        // Auto-fill value from label if value is empty
        if (field === 'label' && !newOpts[index].value) {
            newOpts[index].value = value.toLowerCase().replace(/[^a-z0-9]/g, '_');
        }
        setOptions(newOpts);
    };

    const removeOption = (index: number) => {
        setOptions(options.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.label || !formData.key) {
            toast.error('Nombre y Key son obligatorios');
            return;
        }

        const needsOptions = ['select', 'radio', 'checkbox', 'multiselect'].includes(formData.type);
        if (needsOptions && options.length === 0) {
            toast.error('Debe añadir al menos una opción');
            return;
        }

        setLoading(true);
        try {
            const payload = {
                ...formData,
                options: needsOptions ? options : null
            };

            const url = existingField ? `${API}/crm/custom-fields/${existingField.id}` : `${API}/crm/custom-fields`;
            const method = existingField ? 'PUT' : 'POST';

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
                throw new Error(error.error || 'Error al guardar');
            }

            toast.success('Campo guardado');
            onSaved();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between p-6 border-b border-gray-100 bg-gray-50/50">
                    <h2 className="text-xl font-bold text-gray-900">
                        {existingField ? 'Editar Campo' : 'Añadir Nuevo Campo Personalizado'}
                    </h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 p-6 space-y-6">
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-700 mb-1"><span className="text-red-500">*</span> Tipo de Campo</label>
                            <select 
                                value={formData.type} 
                                onChange={e => setFormData({...formData, type: e.target.value})}
                                disabled={!!existingField} // No se puede cambiar el tipo una vez creado
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none transition-all disabled:opacity-50"
                            >
                                <optgroup label="Texto">
                                    <option value="text">Single Line Text</option>
                                    <option value="textarea">Multi-line Text</option>
                                </optgroup>
                                <optgroup label="Numéricos">
                                    <option value="number">Number</option>
                                </optgroup>
                                <optgroup label="Selección">
                                    <option value="select">Select choice</option>
                                    <option value="multiselect">Multiple Select choice</option>
                                    <option value="radio">Radio Choice</option>
                                    <option value="checkbox">Casilla de verificación</option>
                                </optgroup>
                                <optgroup label="Fecha">
                                    <option value="date">Fecha</option>
                                    <option value="datetime">Fecha y Hora</option>
                                </optgroup>
                                <optgroup label="Contacto">
                                    <option value="url">URL Web</option>
                                </optgroup>
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1"><span className="text-red-500">*</span> Nombre (Label)</label>
                            <input 
                                type="text" 
                                value={formData.label} 
                                onChange={handleLabelChange} 
                                placeholder="Ej: Distrito Rotario"
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none" 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Key Interna</label>
                            <input 
                                type="text" 
                                value={formData.key} 
                                onChange={e => setFormData({...formData, key: e.target.value})} 
                                disabled={!!existingField}
                                placeholder="ej_distrito_rotario"
                                className="w-full p-2.5 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-500 outline-none" 
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Grupo (Opcional)</label>
                            <select 
                                value={formData.groupId} 
                                onChange={e => setFormData({...formData, groupId: e.target.value})}
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none"
                            >
                                <option value="">(Sin grupo)</option>
                                {groups.map((g: any) => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Estado</label>
                            <select 
                                value={formData.status} 
                                onChange={e => setFormData({...formData, status: e.target.value})}
                                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-rotary-blue outline-none"
                            >
                                <option value="active">Activo</option>
                                <option value="hidden">Oculto</option>
                                <option value="archived">Archivado</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 mt-4">
                        <input 
                            type="checkbox" 
                            id="requiredField"
                            checked={formData.required}
                            onChange={e => setFormData({...formData, required: e.target.checked})}
                            className="rounded border-gray-300 text-rotary-blue focus:ring-rotary-blue"
                        />
                        <label htmlFor="requiredField" className="text-sm font-medium text-gray-700 cursor-pointer">
                            Hacer que este campo sea obligatorio en formularios
                        </label>
                    </div>

                    {/* CONSTRUCTOR DE OPCIONES DINÁMICO */}
                    {['select', 'multiselect', 'radio', 'checkbox'].includes(formData.type) && (
                        <div className="mt-8 border border-gray-200 rounded-xl overflow-hidden">
                            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                    <Settings className="w-4 h-4 text-gray-500" /> Constructor de Opciones
                                </h3>
                                <button onClick={handleAddOption} type="button" className="text-xs bg-white border border-gray-200 shadow-sm px-3 py-1.5 rounded-lg font-bold hover:bg-gray-50 transition-colors">
                                    + Añadir Opción
                                </button>
                            </div>
                            
                            <div className="p-4 space-y-3 bg-white">
                                {options.length === 0 ? (
                                    <p className="text-xs text-gray-500 text-center py-4">No has añadido ninguna opción aún.</p>
                                ) : (
                                    <div className="grid grid-cols-12 gap-2 text-xs font-bold text-gray-500 px-2">
                                        <div className="col-span-1"></div>
                                        <div className="col-span-5">Label (Visible)</div>
                                        <div className="col-span-4">Valor (Interno)</div>
                                        <div className="col-span-1">Color</div>
                                        <div className="col-span-1"></div>
                                    </div>
                                )}

                                {options.map((opt, i) => (
                                    <div key={i} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-100 group">
                                        <div className="w-6 flex justify-center text-gray-300 cursor-grab">
                                            <GripVertical className="w-4 h-4" />
                                        </div>
                                        <input 
                                            type="text" 
                                            value={opt.label} 
                                            onChange={e => handleOptionChange(i, 'label', e.target.value)}
                                            placeholder="Label..."
                                            className="flex-1 p-2 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-rotary-blue outline-none"
                                        />
                                        <input 
                                            type="text" 
                                            value={opt.value} 
                                            onChange={e => handleOptionChange(i, 'value', e.target.value)}
                                            placeholder="valor..."
                                            className="w-1/3 p-2 border border-gray-200 rounded text-sm focus:ring-1 focus:ring-rotary-blue outline-none text-gray-600 bg-gray-100"
                                        />
                                        <input 
                                            type="color" 
                                            value={opt.color || '#3B82F6'} 
                                            onChange={e => handleOptionChange(i, 'color', e.target.value)}
                                            className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                                        />
                                        <button type="button" onClick={() => removeOption(i)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm font-bold transition-colors">
                        Cancelar
                    </button>
                    <button onClick={handleSubmit} disabled={loading} className="bg-rotary-blue hover:bg-sky-800 text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50">
                        {loading ? 'Guardando...' : 'Guardar Campo'}
                    </button>
                </div>
            </div>
        </div>
    );
}
