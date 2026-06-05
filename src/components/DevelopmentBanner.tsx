import React, { useState, useEffect } from 'react';
import { Construction, X, ChevronRight } from 'lucide-react';
import { useClub } from '../contexts/ClubContext';
import { useAuth } from '../hooks/useAuth';

const DevelopmentBanner: React.FC = () => {
    const { club, developmentBannerVisible, setDevelopmentBannerVisible } = useClub();
    const { user } = useAuth();
    const [shouldRender, setShouldRender] = useState(false);
    const [loading, setLoading] = useState(false);

    // The audio mentions it should appear 10 to 15 seconds after navigating.
    useEffect(() => {
        if (!club || !club.developmentBannerActive) return;

        const timer = setTimeout(() => {
            setShouldRender(true);
        }, 15000); // 15 seconds delay

        return () => clearTimeout(timer);
    }, [club]);

    if (!club || !club.developmentBannerActive || !developmentBannerVisible || !shouldRender) return null;

    // Activación directa vía Stripe Checkout (Ecosistema Digital). Reutiliza el
    // mismo endpoint que el banner de vencimiento: crea la sesión de pago del
    // plan integrado en la app y redirige al checkout de Stripe.
    const handleActivateClick = async () => {
        if (!user) {
            // Sin sesión: lo mandamos al login y de vuelta a configuración para activar.
            window.location.href = `/login?redirect=/admin/configuracion`;
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/clubs/${club.id}/billing-portal`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                if (data.url) {
                    window.location.href = data.url;
                    return;
                }
            }
            // Si el endpoint falla (rol, config), lo mandamos a Facturación en configuración.
            window.location.href = '/admin/configuracion';
        } catch (error) {
            window.location.href = '/admin/configuracion';
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="sticky top-0 flex items-center justify-center overflow-hidden bg-yellow-500 px-6 py-2 z-[99998] shadow-lg border-b border-yellow-600/50 animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-x-4 w-full justify-center relative flex-wrap sm:flex-nowrap gap-y-2">
                <div className="flex items-center gap-x-4">
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <Construction className="w-5 h-5 text-yellow-900 animate-pulse" />
                        <div className="bg-yellow-600/80 px-4 py-1 rounded-lg shadow-inner border border-yellow-700/20">
                            <span className="font-black uppercase tracking-[0.25em] text-[10px] text-yellow-950">Desarrollo</span>
                        </div>
                    </div>
                    <p className="text-[12px] leading-6 text-yellow-950 font-medium">
                        {club.developmentBannerMessage || 'Sitio en construcción. Para poder publicar el sitio o llevar a un entorno de producción, por favor contacta a soporte.'}
                    </p>
                </div>

                <button
                    onClick={handleActivateClick}
                    disabled={loading}
                    className="flex items-center gap-1 bg-yellow-900 text-yellow-50 px-3 py-1 text-xs font-bold rounded-md hover:bg-yellow-800 transition-colors ml-4 shadow-sm disabled:opacity-60"
                >
                    {loading ? (
                        <>
                            <span className="w-3 h-3 border-2 border-yellow-50/30 border-t-yellow-50 rounded-full animate-spin" />
                            Redirigiendo…
                        </>
                    ) : (
                        <>
                            Activar Ahora <ChevronRight className="w-3 h-3" />
                        </>
                    )}
                </button>

                <button 
                    type="button" 
                    onClick={() => setDevelopmentBannerVisible(false)} 
                    className="absolute right-0 p-1.5 hover:bg-yellow-600/20 rounded-full transition-colors group"
                    title="Cerrar (se reactivará en 10s)"
                >
                    <X className="h-4 w-4 text-yellow-900/50 group-hover:text-yellow-900 transition-colors" />
                </button>
            </div>
        </div>
    );
};

export default DevelopmentBanner;
