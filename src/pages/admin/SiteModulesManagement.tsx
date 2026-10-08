import React from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { SiteModulesManagerModal } from '../../components/admin/SiteModulesManagerModal';
import { Sliders, ShieldCheck } from 'lucide-react';

export const SiteModulesManagement: React.FC = () => {
    return (
        <AdminLayout>
            <div className="space-y-6">
                {/* Header banner */}
                <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-6 text-white shadow-md border border-slate-800">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                                <Sliders className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl font-black text-white tracking-tight">
                                        Gestión Centralizada de Módulos por Sitio
                                    </h1>
                                    <span className="bg-blue-600 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                        Super Admin
                                    </span>
                                </div>
                                <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                                    Administra qué herramientas y grupos aparecen en la barra lateral de cada club rotario.
                                    Configura los valores globales heredados por los sitios o define excepciones particulares para organizaciones específicas.
                                </p>
                            </div>
                        </div>

                        <div className="hidden lg:flex items-center gap-2 text-xs bg-white/10 px-3.5 py-2 rounded-xl border border-white/10 backdrop-blur-xs">
                            <ShieldCheck className="w-4 h-4 text-emerald-400" />
                            <span className="font-semibold text-slate-200">
                                Restricción de permisos y URLs activa
                            </span>
                        </div>
                    </div>
                </div>

                {/* Inline manager component */}
                <SiteModulesManagerModal inline={true} />
            </div>
        </AdminLayout>
    );
};

export default SiteModulesManagement;
