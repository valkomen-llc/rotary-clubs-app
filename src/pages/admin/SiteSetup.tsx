import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import SiteSetupCard from '../../components/admin/SiteSetupCard';

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Sparkles, Globe } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

const SiteSetupPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const isSuperAdmin = (user as any)?.role === 'administrator';

    // Stats needed for SiteSetupCard checklist
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        const token = localStorage.getItem('rotary_token');
        fetch(`${API}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(setStats)
            .catch(() => { });
    }, [isSuperAdmin]);

    return (
        <AdminLayout>

            {/* Page header */}
            <div className="flex items-start justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-rotary-blue/10 flex items-center justify-center">
                        <Sparkles className="w-6 h-6 text-rotary-blue" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">
                            Configuración del sitio
                        </h1>
                        <p className="text-sm text-gray-400 font-medium mt-1">
                            {isSuperAdmin
                                ? 'Plataforma ClubPlatform'
                                : 'Completa la información para que tu sitio esté 100% listo'}
                        </p>
                    </div>
                </div>
            </div>

            {/* For super admin: platform configurations */}
            {/* For super admin: platform configurations */}
            {isSuperAdmin ? (
                <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm p-8 flex items-center justify-center min-h-[400px]">
                    <div className="text-center">
                        <Globe className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                        <h2 className="text-xl font-black text-gray-900 mb-2">Plataforma Global Activa</h2>
                        <p className="text-gray-500">Por favor dirígete a la sección <strong>Settings</strong> para configurar parámetros globales.</p>
                    </div>
                </div>
            ) : (
                <SiteSetupCard stats={stats} onOpenWizard={() => navigate('/admin/onboarding')} />
            )}
        </AdminLayout>
    );
};

export default SiteSetupPage;
