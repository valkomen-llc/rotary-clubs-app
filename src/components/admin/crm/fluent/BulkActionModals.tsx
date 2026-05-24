import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Tag, ListFilter, AlertCircle, RefreshCw, X, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../../ui/dialog";
import { useBulkProcessing } from './BulkProcessingProvider';
import { useAuth } from '../../../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

interface BulkActionModalsProps {
  actionType: string | null;
  isOpen: boolean;
  onClose: () => void;
  selectedContactIds: string[];
  isAllFilteredSelected: boolean;
  totalFilteredCount: number;
  currentFilterPayload: any; // { search, status, tags, lists }
  onSuccess: () => void; // Para limpiar selección en el padre
}

export default function BulkActionModals({
  actionType,
  isOpen,
  onClose,
  selectedContactIds,
  isAllFilteredSelected,
  totalFilteredCount,
  currentFilterPayload,
  onSuccess
}: BulkActionModalsProps) {
  
  const { addJob } = useBulkProcessing();
  const [loading, setLoading] = useState(false);
  const [availableTags, setAvailableTags] = useState<any[]>([]);
  const [availableLists, setAvailableLists] = useState<any[]>([]);
  
  const { token } = useAuth();
  
  // States for forms
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('subscribed');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const targetCount = isAllFilteredSelected ? totalFilteredCount : selectedContactIds.length;

  useEffect(() => {
    if (isOpen && ['add_tags', 'remove_tags', 'assign_lists_tags', 'remove_lists_tags'].includes(actionType || '')) {
      fetchTags();
    }
    if (isOpen && ['add_lists', 'remove_lists', 'assign_lists_tags', 'remove_lists_tags'].includes(actionType || '')) {
      fetchLists();
    }
  }, [isOpen, actionType]);

  const fetchTags = async () => {
    try {
      if (!token) return;
      const res = await axios.get(`${API}/crm/tags`, { headers: { Authorization: `Bearer ${token}` } });
      setAvailableTags(res.data);
    } catch (error) { console.error(error); }
  };

  const fetchLists = async () => {
    try {
      if (!token) return;
      const res = await axios.get(`${API}/crm/lists`, { headers: { Authorization: `Bearer ${token}` } });
      setAvailableLists(res.data);
    } catch (error) { console.error(error); }
  };

  const handleStartJob = async () => {
    let payload: any = {};
    
    if (actionType === 'add_tags' || actionType === 'remove_tags') {
      if (selectedTags.length === 0) return toast.error('Selecciona al menos una etiqueta');
      payload = { tags: selectedTags };
    } else if (actionType === 'add_lists' || actionType === 'remove_lists') {
      if (selectedLists.length === 0) return toast.error('Selecciona al menos una lista');
      payload = { lists: selectedLists };
    } else if (actionType === 'assign_lists_tags' || actionType === 'remove_lists_tags') {
      if (selectedLists.length === 0 && selectedTags.length === 0) return toast.error('Selecciona al menos una lista o etiqueta');
      payload = { lists: selectedLists, tags: selectedTags };
    } else if (actionType === 'change_status') {
      payload = { status: selectedStatus };
    } else if (actionType === 'delete') {
      if (deleteConfirmation !== 'ELIMINAR') return toast.error('Debes escribir ELIMINAR para confirmar');
    }

    setLoading(true);
    try {
      if (!token) return;
      const response = await axios.post(`${API}/crm/contacts/bulk-action/init`, {
        actionType,
        actionPayload: payload,
        selectionMode: isAllFilteredSelected ? 'global' : 'explicit',
        contactIds: isAllFilteredSelected ? null : selectedContactIds,
        filterPayload: isAllFilteredSelected ? currentFilterPayload : null
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success && response.data.job) {
        addJob(response.data.job);
        onSuccess();
        onClose();
        // Reset states
        setSelectedTags([]);
        setSelectedLists([]);
        setDeleteConfirmation('');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Error al iniciar la acción masiva');
    } finally {
      setLoading(false);
    }
  };

  const toggleTag = (id: string) => {
    setSelectedTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const toggleList = (id: string) => {
    setSelectedLists(prev => prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]);
  };

  const renderContent = () => {
    if (actionType === 'add_tags' || actionType === 'remove_tags' || actionType === 'assign_lists_tags' || actionType === 'remove_lists_tags') {
      const isCombined = actionType === 'assign_lists_tags' || actionType === 'remove_lists_tags';
      const isRemove = actionType === 'remove_tags' || actionType === 'remove_lists_tags';
      
      return (
        <div className="space-y-6 py-4">
          <p className="text-sm text-gray-600">
            Selecciona las listas y/o etiquetas que deseas {isRemove ? 'remover de' : 'asignar a'} los <strong>{targetCount}</strong> contactos seleccionados.
          </p>
          
          {(isCombined || actionType === 'add_lists' || actionType === 'remove_lists') && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Listas</h4>
              <div className="grid grid-cols-2 gap-3 max-h-[150px] overflow-y-auto p-1">
                {availableLists.map(list => (
                  <div 
                    key={list.id} 
                    onClick={() => toggleList(list.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selectedLists.includes(list.id) ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${selectedLists.includes(list.id) ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                      {selectedLists.includes(list.id) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: list.color || '#3b82f6' }} />
                      <span className="text-sm font-medium text-gray-700">{list.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(isCombined || actionType === 'add_tags' || actionType === 'remove_tags') && (
            <div>
              <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Etiquetas</h4>
              <div className="grid grid-cols-2 gap-3 max-h-[150px] overflow-y-auto p-1">
                {availableTags.map(tag => (
                  <div 
                    key={tag.id} 
                    onClick={() => toggleTag(tag.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selectedTags.includes(tag.id) ? 'border-blue-500 bg-blue-50/50' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${selectedTags.includes(tag.id) ? 'border-blue-500 bg-blue-500' : 'border-gray-300'}`}>
                      {selectedTags.includes(tag.id) && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color || '#3b82f6' }} />
                      <span className="text-sm font-medium text-gray-700">{tag.name}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    if (actionType === 'change_status') {
      return (
        <div className="space-y-4 py-4">
          <p className="text-sm text-gray-600">
            Selecciona el nuevo estado para los <strong>{targetCount}</strong> contactos seleccionados.
          </p>
          <div className="space-y-2">
            <select 
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full h-11 px-3 border border-gray-200 rounded-lg outline-none focus:border-blue-500 transition-colors"
            >
              <option value="subscribed">Suscrito</option>
              <option value="pending">Pendiente</option>
              <option value="unsubscribed">No Suscrito</option>
              <option value="bounced">Rebotado</option>
            </select>
          </div>
        </div>
      );
    }

    if (actionType === 'delete') {
      return (
        <div className="space-y-4 py-4">
          <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <strong className="block mb-1">Peligro: Acción irreversible</strong>
              Estás a punto de eliminar definitivamente <strong>{targetCount}</strong> contactos de la base de datos. Se perderán sus historiales, actividades y membresías de listas.
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Escribe <strong>ELIMINAR</strong> para confirmar:
            </label>
            <input 
              type="text" 
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              className="w-full h-11 px-3 border border-gray-200 rounded-lg outline-none focus:border-red-500 transition-colors"
              placeholder="ELIMINAR"
            />
          </div>
        </div>
      );
    }

    return null;
  };

  const getTitle = () => {
    switch(actionType) {
      case 'add_tags': return 'Añadir Etiquetas';
      case 'remove_tags': return 'Remover Etiquetas';
      case 'add_lists': return 'Añadir a Listas';
      case 'remove_lists': return 'Remover de Listas';
      case 'assign_lists_tags': return 'Asignar a Listas y Etiquetas';
      case 'remove_lists_tags': return 'Remover de Listas y Etiquetas';
      case 'change_status': return 'Cambiar Estado';
      case 'delete': return 'Eliminar Contactos';
      default: return 'Acción Masiva';
    }
  };

  const getButtonText = () => {
    if (loading) return 'Iniciando...';
    if (actionType === 'delete') return 'Sí, Eliminar Contactos';
    return 'Aplicar a Contactos';
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-white border-0 shadow-2xl rounded-2xl overflow-hidden p-0">
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <DialogTitle className="text-lg font-bold text-gray-900">
            {getTitle()}
          </DialogTitle>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="px-6">
          {renderContent()}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-200 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={handleStartJob}
            disabled={loading || (actionType === 'delete' && deleteConfirmation !== 'ELIMINAR')}
            className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white rounded-xl shadow-sm transition-all ${
              actionType === 'delete' 
                ? 'bg-red-600 hover:bg-red-700 focus:ring-4 focus:ring-red-100 disabled:opacity-50 disabled:bg-red-400' 
                : 'bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:ring-blue-100'
            }`}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {getButtonText()}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
