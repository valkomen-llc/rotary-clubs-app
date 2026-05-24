import React, { useState } from 'react';
import { 
  X, Check, ChevronDown, Tag, ListFilter, Users, 
  Trash2, Download, AlertCircle, RefreshCw
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../../ui/dropdown-menu";

interface BulkActionsBarProps {
  selectedCount: number;
  totalFilteredCount: number;
  isAllFilteredSelected: boolean;
  onClearSelection: () => void;
  onSelectAllFiltered: () => void;
  onActionSelect: (action: string) => void;
}

export default function BulkActionsBar({
  selectedCount,
  totalFilteredCount,
  isAllFilteredSelected,
  onClearSelection,
  onSelectAllFiltered,
  onActionSelect
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border border-gray-200 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-2xl px-4 py-3 flex items-center gap-6 z-40 animate-in slide-in-from-bottom-8 duration-300">
      
      {/* Selection Info */}
      <div className="flex items-center gap-3 border-r border-gray-100 pr-6">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-50 text-blue-600 font-bold text-sm">
          {isAllFilteredSelected ? totalFilteredCount : selectedCount}
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-800">
            {isAllFilteredSelected ? 'Todos seleccionados' : 'Contactos seleccionados'}
          </span>
          {!isAllFilteredSelected && selectedCount < totalFilteredCount && (
            <button 
              onClick={onSelectAllFiltered}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium text-left"
            >
              Seleccionar los {totalFilteredCount} resultados
            </button>
          )}
        </div>
      </div>

      {/* Action Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors">
            Seleccionar Acción
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-white border-gray-200 shadow-xl rounded-xl p-1">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2 py-1.5">
              Organización
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onActionSelect('assign_lists_tags')} className="flex items-center gap-2 px-2 py-2 text-sm cursor-pointer rounded-md hover:bg-blue-50 hover:text-blue-700 focus:bg-blue-50 focus:text-blue-700">
              <Tag className="w-4 h-4" /> Asignar a Listas y Etiquetas
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onActionSelect('remove_lists_tags')} className="flex items-center gap-2 px-2 py-2 text-sm cursor-pointer rounded-md hover:bg-gray-50 focus:bg-gray-50">
              <Tag className="w-4 h-4 text-gray-400" /> Remover de Listas y Etiquetas
            </DropdownMenuItem>
          </DropdownMenuGroup>
          
          <DropdownMenuSeparator className="bg-gray-100 my-1" />
          
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2 py-1.5">
              Actualización
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onActionSelect('change_status')} className="flex items-center gap-2 px-2 py-2 text-sm cursor-pointer rounded-md hover:bg-gray-50 focus:bg-gray-50">
              <RefreshCw className="w-4 h-4 text-gray-400" /> Cambiar Estado
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator className="bg-gray-100 my-1" />

          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-xs font-bold text-gray-500 uppercase tracking-wider px-2 py-1.5">
              Peligro
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onActionSelect('delete')} className="flex items-center gap-2 px-2 py-2 text-sm cursor-pointer rounded-md text-red-600 hover:bg-red-50 focus:bg-red-50 focus:text-red-700">
              <Trash2 className="w-4 h-4" /> Eliminar Contactos
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Clear Selection Button */}
      <button 
        onClick={onClearSelection}
        className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
        title="Limpiar selección"
      >
        <X className="w-5 h-5" />
      </button>

    </div>
  );
}
