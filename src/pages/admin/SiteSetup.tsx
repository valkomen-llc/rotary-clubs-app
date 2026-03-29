import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import SiteSetupCard from '../../components/admin/SiteSetupCard';

import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Sparkles, CheckCircle2, Map, Save } from 'lucide-react';
import { toast } from 'sonner';

const API = import.meta.env.VITE_API_URL || '/api';

const SiteSetupPage: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const isSuperAdmin = (user as any)?.role === 'administrator';

    // Stats needed for SiteSetupCard checklist
    const [stats, setStats] = useState<any>(null);
    const [mapStyle, setMapStyle] = useState<string>('m');
    const [savingMap, setSavingMap] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('rotary_token');
        fetch(`${API}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(setStats)
            .catch(() => { });

        if (isSuperAdmin) {
            fetch(`${API}/admin/global-map-style`, { headers: { Authorization: `Bearer ${token}` } })
                .then(r => r.json())
                .then(data => setMapStyle(data.mapStyle || 'm'))
                .catch(() => { });
        }
    }, [isSuperAdmin]);

    const handleSaveMapStyle = async () => {
        setSavingMap(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${API}/admin/global-map-style`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ mapStyle })
            });

            if (res.ok) {
                toast.success('Estilo de mapa guardado globalmente');
            } else {
                toast.error('Error al guardar el estilo de mapa');
            }
        } catch (error) {
            toast.error('Error de conexión');
        } finally {
            setSavingMap(false);
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
                                ? 'Ajustes Globales de la Plataforma ClubPlatform'
                                : 'Completa la información para que tu sitio esté 100% listo'}
                        </p>
                    </div>
                </div>
            </div>

            {/* For super admin: Global Settings */}
            {isSuperAdmin ? (
                <div className="space-y-6">
                    <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center shadow-sm">
                        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                        </div>
                        <h2 className="text-xl font-black text-gray-900 mb-2">Plataforma configurada</h2>
                        <p className="text-sm text-gray-400 max-w-md mx-auto">
                            Como Super Administrador puedes gestionar la configuración de cada club individualmente
                            desde <strong>Clubes → Editar club</strong>.
                        </p>
                    </div>

                    <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <Map className="w-6 h-6 text-rotary-blue" />
                            <h2 className="text-xl font-black text-gray-900">Mapas de Google (Sección Contacto)</h2>
                        </div>
                        <p className="text-sm text-gray-500 mb-6 max-w-2xl">
                            Selecciona el estilo visual que tendrán por defecto los mapas de ubicación en la sección de contacto de <strong>todos los clubes</strong> de la plataforma.
                        </p>
                        
                        <div className="max-w-md bg-gray-50 p-6 rounded-xl border border-gray-100">
                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                Tipo de Mapa
                            </label>
                            <select
                                value={mapStyle}
                                onChange={(e) => setMapStyle(e.target.value)}
                                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-rotary-blue/20 outline-none transition-all mb-4"
                            >
                                <option value="m">Estándar (Predeterminado)</option>
                                <option value="k">Satélite (Sin etiquetas)</option>
                                <option value="h">Híbrido (Satélite + Etiquetas)</option>
                                <option value="p">Terreno / Relieve</option>
                            </select>
                            
                            <button
                                onClick={handleSaveMapStyle}
                                disabled={savingMap}
                                className="flex items-center justify-center gap-2 w-full bg-rotary-blue hover:bg-rotary-dark-blue text-white px-4 py-3 rounded-xl font-bold transition-colors disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" />
                                {savingMap ? 'Guardando...' : 'Aplicar a todos los clubes'}
                            </button>
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
