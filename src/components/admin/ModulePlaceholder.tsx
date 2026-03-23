import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Construction } from 'lucide-react';

interface ModulePlaceholderProps {
    icon: LucideIcon;
    title: string;
    description: string;
    color?: string;
}

const ModulePlaceholder: React.FC<ModulePlaceholderProps> = ({ icon: Icon, title, description, color = '#019fcb' }) => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6 shadow-2xl" style={{ backgroundColor: color + '15' }}>
            <Icon className="w-10 h-10" style={{ color }} />
        </div>
        <h1 className="text-2xl font-black text-gray-900 mb-2">{title}</h1>
        <p className="text-sm text-gray-400 max-w-md mb-8">{description}</p>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-6 py-4 max-w-sm">
            <div className="flex items-center gap-3 mb-2">
                <Construction className="w-5 h-5 text-amber-500" />
                <span className="text-sm font-bold text-amber-700">En desarrollo</span>
            </div>
            <p className="text-xs text-amber-600 leading-relaxed">
                Esta sección estará disponible próximamente. Estamos trabajando para brindarte la mejor experiencia.
            </p>
        </div>
    </div>
);

export default ModulePlaceholder;
