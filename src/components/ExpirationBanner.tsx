import React, { useState } from 'react';
import { AlertTriangle, X, ArrowRight, CreditCard, Lock } from 'lucide-react';
import { useClub } from '../contexts/ClubContext';
import { useAuth } from '../hooks/useAuth';
import { toast } from 'sonner';

const ExpirationBanner: React.FC = () => {
    const { club, bannerVisible, setBannerVisible } = useClub();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);

    if (!club || !club.expirationBannerActive || !bannerVisible) return null;

    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    const handleAction = async () => {
        if (!user) {
            // Si no está logueado, lo mandamos al login con retorno a configuración
            window.location.href = `/login?redirect=/admin/configuracion`;
            return;
        }

        // Si está logueado, intentamos abrir el portal/checkout directamente
        setLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/clubs/${club.id}/billing-portal`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                if (data.url) window.location.href = data.url;
            } else {
                // Si falla el endpoint directo (tal vez por rol), lo mandamos a configuración
                window.location.href = '/admin/configuracion';
            }
        } catch (error) {
            window.location.href = '/admin/configuracion';
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="sticky top-0 flex items-center justify-center overflow-hidden bg-red-600 px-6 py-3 z-[99999] shadow-2xl border-b border-red-700/50 animate-in slide-in-from-top duration-300">
            <div className="flex flex-col md:flex-row items-center gap-x-6 gap-y-3 w-full justify-center relative">
                <div className="flex items-center gap-x-4">
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <AlertTriangle className="w-5 h-5 text-yellow-300 animate-pulse" />
                        <div className="bg-red-800/80 px-4 py-1 rounded-lg shadow-inner border border-red-900/20">
                            <span className="font-black uppercase tracking-[0.25em] text-[10px] text-white">Vencimiento</span>
                        </div>
                    </div>
                    <p className="text-[12px] md:text-[13px] leading-tight text-white font-medium max-w-2xl text-center md:text-left">
                        Sitio en periodo de renovación {currentYear}-{nextYear}. Asegure la continuidad de sus servicios digitales antes de la suspensión automática.
                    </p>
                </div>

                <button 
                    onClick={handleAction}
                    disabled={loading}
                    className="flex items-center gap-2.5 px-6 py-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-red-900 rounded-full font-black text-[11px] uppercase tracking-wider transition-all shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 group"
                >
                    {loading ? (
                        <div className="w-4 h-4 border-2 border-red-900/30 border-t-red-900 rounded-full animate-spin" />
                    ) : user ? (
                        <CreditCard className="w-3.5 h-3.5" />
                    ) : (
                        <Lock className="w-3.5 h-3.5" />
                    )}
                    <span>{user ? 'Renovar Ahora' : 'Ingresar para Renovar'}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                </button>

                <button 
                    type="button" 
                    onClick={() => setBannerVisible(false)} 
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 hover:bg-red-500/20 rounded-full transition-colors group hidden md:block"
                    title="Ocultar"
                >
                    <X className="h-4 w-4 text-white/50 group-hover:text-white transition-colors" />
                </button>
            </div>
        </div>
    );
};

export default ExpirationBanner;
