import React, { useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import SiteSetupCard from '../../components/admin/SiteSetupCard';
import OnboardingWizard from '../../components/admin/OnboardingWizard';
import { useAuth } from '../../hooks/useAuth';
import { Sparkles, CheckCircle2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';

const SiteSetupPage: React.FC = () => {
    const { user } = useAuth();
    const isSuperAdmin = (user as any)?.role === 'administrator';
    const [showWizard, setShowWizard] = useState(false);

    // Stats needed for SiteSetupCard checklist
    const [stats, setStats] = React.useState<any>(null);
    React.useEffect(() => {
        const token = localStorage.getItem('rotary_token');
        fetch(`${API}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(setStats)
            .catch(() => { });
    }, []);

    return (
        <AdminLayout>
            {showWizard && (
                <OnboardingWizard onDismiss={() => setShowWizard(false)} />
            )}

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

            {/* For super admin: simple message pointing to each club */}
            {isSuperAdmin ? (
                <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center shadow-sm">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    </div>
                    <h2 className="text-xl font-black text-gray-900 mb-2">Plataforma configurada</h2>
                    <p className="text-sm text-gray-400 max-w-md mx-auto">
                        Como Super Administrador puedes gestionar la configuración de cada club individualmente
                        desde <strong>Clubes → Editar club</strong>. El asistente de onboarding está disponible
                        para los administradores de cada club.
                    </p>
                </div>
            ) : (
                <SiteSetupCard stats={stats} onOpenWizard={() => setShowWizard(true)} />
            )}
        </AdminLayout>
    );
};

export default SiteSetupPage;
