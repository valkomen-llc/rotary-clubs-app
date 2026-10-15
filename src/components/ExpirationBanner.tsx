import React, { useState } from 'react';
import { AlertTriangle, X, ArrowRight, CreditCard, Lock, Clock } from 'lucide-react';
import { useClub } from '../contexts/ClubContext';
import { useAuth } from '../hooks/useAuth';
import { subscriptionHealth, type BannerKind } from '../lib/siteExpiration';

// ════════════════════════════════════════════════════════════════════
// LA BARRA DE VENCIMIENTO — pinta; no decide.
//
// ⚠️ Qué barra se ve, con qué texto y de qué color lo resuelve
// `subscriptionHealth` (src/lib/siteExpiration.ts), que comparte el
// desplazamiento del menú y el panel de administración. Hasta v4.1203 esta
// pantalla tenía su propio texto fijo —«periodo de renovación AAAA-AAAA»— y lo
// pintaba en rojo aunque la suscripción estuviera al día: es el defecto que se
// reportó con Bogotá Occidente.
// ════════════════════════════════════════════════════════════════════

const PIEL: Record<Exclude<BannerKind, null>, {
    chip: string; fondo: string; borde: string; chipFondo: string; renovar: boolean;
}> = {
    preventivo: { chip: 'Renovación', fondo: 'bg-amber-600', borde: 'border-amber-700/50', chipFondo: 'bg-amber-800/80', renovar: true },
    pendiente: { chip: 'Pago en proceso', fondo: 'bg-amber-600', borde: 'border-amber-700/50', chipFondo: 'bg-amber-800/80', renovar: false },
    vencimiento: { chip: 'Vencimiento', fondo: 'bg-red-600', borde: 'border-red-700/50', chipFondo: 'bg-red-800/80', renovar: true },
    manual: { chip: 'Vencimiento', fondo: 'bg-red-600', borde: 'border-red-700/50', chipFondo: 'bg-red-800/80', renovar: true },
    suspension: { chip: 'Suspendido', fondo: 'bg-red-700', borde: 'border-red-800/50', chipFondo: 'bg-red-900/80', renovar: true },
};

const ExpirationBanner: React.FC = () => {
    const { club, bannerVisible, setBannerVisible } = useClub();
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);

    const salud = club ? subscriptionHealth(club) : null;
    if (!club || !salud || !salud.banner || !bannerVisible) return null;

    const piel = PIEL[salud.banner];
    const Icono = salud.banner === 'pendiente' ? Clock : AlertTriangle;

    const handleAction = async () => {
        if (!user) {
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
                if (data.url) window.location.href = data.url;
            } else {
                window.location.href = '/admin/configuracion';
            }
        } catch {
            window.location.href = '/admin/configuracion';
        } finally {
            setLoading(false);
        }
    };

    return (
        <div
            data-expiration-banner={salud.banner}
            className={`sticky top-0 flex items-center justify-center overflow-hidden ${piel.fondo} px-6 py-3 z-[99999] shadow-2xl border-b ${piel.borde} animate-in slide-in-from-top duration-300`}
        >
            <div className="flex flex-col md:flex-row items-center gap-x-6 gap-y-3 w-full justify-center relative">
                <div className="flex items-center gap-x-4">
                    <div className="flex items-center gap-3 flex-shrink-0">
                        <Icono className="w-5 h-5 text-yellow-300 animate-pulse" />
                        <div className={`${piel.chipFondo} px-4 py-1 rounded-lg shadow-inner border border-black/10`}>
                            <span className="font-black uppercase tracking-[0.25em] text-[10px] text-white">{piel.chip}</span>
                        </div>
                    </div>
                    <p className="text-[12px] md:text-[13px] leading-tight text-white font-medium max-w-2xl text-center md:text-left">
                        {salud.message}
                    </p>
                </div>

                {/* Con el pago en proceso no se ofrece pagar otra vez: sería invitar a un cobro doble. */}
                {piel.renovar && (
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
                )}

                <button
                    type="button"
                    onClick={() => setBannerVisible(false)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 p-1.5 hover:bg-black/10 rounded-full transition-colors group hidden md:block"
                    title="Ocultar"
                >
                    <X className="h-4 w-4 text-white/50 group-hover:text-white transition-colors" />
                </button>
            </div>
        </div>
    );
};

export default ExpirationBanner;
