import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import SiteSetupCard from '../../components/admin/SiteSetupCard';

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Sparkles, CheckCircle2, Globe, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

const SiteSetupPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const isSuperAdmin = (user as any)?.role === 'administrator';

    // Stats needed for SiteSetupCard checklist
    const [stats, setStats] = useState<any>(null);

    // Super Admin config
    const [saasRedirect, setSaasRedirect] = useState(false);
    const [updatingRedirect, setUpdatingRedirect] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('rotary_token');
        fetch(`${API}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(setStats)
            .catch(() => { });

        if (isSuperAdmin) {
            fetch(`${API}/admin/platform-config/logo`) // using same public endpoint as it returns saasRedirect
                .then(r => r.json())
                .then(data => setSaasRedirect(data.saasRedirect))
                .catch(() => {});
        }
    }, [isSuperAdmin]);

    const handleToggleRedirect = async () => {
        setUpdatingRedirect(true);
        const newState = !saasRedirect;
        try {
            const token = localStorage.getItem('rotary_token');
            const r = await fetch(`${API}/admin/platform-config/redirect`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ active: newState })
            });
            if (r.ok) {
                setSaasRedirect(newState);
                toast.success(newState ? 'Redirección a la app activada.' : 'El landing público de ClubPlatform está activo.');
            } else {
                toast.error('Error al actualizar redirección.');
            }
        } catch {
            toast.error('Error de red al actualizar.');
        } finally {
            setUpdatingRedirect(false);
        }
    };

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
            {isSuperAdmin ? (
                <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-8 border-b border-gray-100">
                        <div className="flex items-center gap-4 mb-2">
                            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                                <Globe className="w-6 h-6 text-emerald-500" />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-gray-900">Enrutamiento Principal</h2>
                                <p className="text-sm text-gray-500">Configura dónde aterriza el tráfico de clubplatform.org</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-8 bg-gray-50/50">
                        <div className="flex items-center justify-between p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
                            <div className="flex-1 mr-4">
                                <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-1">
                                    Mandar tráfico directo a la App
                                    {saasRedirect && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full uppercase">Activo</span>}
                                </h3>
                                <p className="text-sm text-gray-500">
                                    Si esto está activado, los usuarios que ingresen a <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-xs text-gray-700">clubplatform.org</span> serán redirigidos inmediatamente a <span className="font-mono bg-gray-100 px-1 py-0.5 rounded text-xs text-gray-700">app.clubplatform.org</span> en lugar de ver el landing promocional SaaS.
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                                <input type="checkbox" className="sr-only peer" checked={saasRedirect} onChange={handleToggleRedirect} disabled={updatingRedirect} />
                                <div className="w-14 h-7 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-rotary-blue disabled:opacity-50"></div>
                            </label>
                            {updatingRedirect && <Loader2 className="w-4 h-4 animate-spin text-rotary-blue ml-3 absolute right-2" />}
                        </div>
                        
                        <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-xl flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                            <div className="text-sm text-blue-800">
                                <p className="font-bold mb-1">Configuración multitenant conservada</p>
                                <p className="opacity-90">Los subdominios de clubes específicos (<span className="font-mono text-xs">ejemplo.clubplatform.org</span>) seguirán funcionando con normalidad mostrando sus respetivos portales. Esta configuración solo afecta al dominio principal o "root".</p>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <SiteSetupCard stats={stats} onOpenWizard={() => navigate('/admin/onboarding')} />
            )}
        </AdminLayout>
    );
};

export default SiteSetupPage;
