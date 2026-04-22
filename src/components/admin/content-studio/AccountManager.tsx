import React, { useEffect, useState } from 'react';
import { 
    Instagram, 
    Video as TikTok, 
    Youtube, 
    Facebook,
    Plus,
    X,
    Loader2,
    CheckCircle2,
    LogOut,
    ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';

interface SocialAccount {
    id: string;
    platform: string;
    accountName: string;
    createdAt: string;
}

const AccountManager: React.FC = () => {
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchAccounts();
    }, []);

    const fetchAccounts = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/content-studio/accounts`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setAccounts(data);
            }
        } catch (error) {
            toast.error('Error al cargar cuentas sociales');
        } finally {
            setLoading(false);
        }
    };

    const platforms = [
        { id: 'instagram', name: 'Instagram Reels', icon: Instagram, color: 'text-pink-600', bg: 'bg-pink-50' },
        { id: 'tiktok', name: 'TikTok', icon: TikTok, color: 'text-slate-900', bg: 'bg-slate-50' },
        { id: 'youtube', name: 'YouTube Shorts', icon: Youtube, color: 'text-red-600', bg: 'bg-red-50' },
        { id: 'facebook', name: 'Facebook Reels', icon: Facebook, color: 'text-blue-600', bg: 'bg-blue-50' }
    ];

    const connectAccount = (platformId: string) => {
        toast.info(`Iniciando conexión con ${platformId}... (Simulación OAuth)`);
        // In a real app, redirect to OAuth URL
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Connection Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {platforms.map((platform) => {
                    const connected = accounts.filter(a => a.platform === platform.id);
                    return (
                        <div key={platform.id} className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm flex flex-col items-center text-center">
                            <div className={`w-16 h-16 ${platform.bg} ${platform.color} rounded-2xl flex items-center justify-center mb-6 shadow-sm`}>
                                <platform.icon className="w-8 h-8" />
                            </div>
                            <h3 className="font-black text-gray-900 mb-1">{platform.name}</h3>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-8">
                                {connected.length > 0 ? `${connected.length} cuenta(s) conectada(s)` : 'Sin conexión'}
                            </p>
                            
                            {connected.length > 0 ? (
                                <div className="w-full space-y-2">
                                    {connected.map(acc => (
                                        <div key={acc.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100 group">
                                            <span className="text-xs font-bold text-gray-700">@{acc.accountName}</span>
                                            <button className="text-gray-300 hover:text-red-500 transition-all">
                                                <LogOut className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                    <button 
                                        onClick={() => connectAccount(platform.id)}
                                        className="w-full py-2 bg-gray-50 border border-gray-100 rounded-xl text-[10px] font-black text-gray-400 hover:bg-gray-100 transition-all mt-2"
                                    >
                                        + Agregar otra
                                    </button>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => connectAccount(platform.id)}
                                    className="w-full py-3 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-indigo-600/20 hover:scale-105 active:scale-95 transition-all"
                                >
                                    Conectar Cuenta
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Info Box */}
            <div className="bg-gradient-to-r from-gray-900 to-indigo-950 p-8 rounded-[32px] text-white flex flex-col md:flex-row items-center gap-8 border border-white/10 shadow-2xl">
                <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm shrink-0">
                    <ShieldCheck className="w-10 h-10 text-indigo-400" />
                </div>
                <div className="flex-1">
                    <h3 className="text-xl font-black mb-2">Seguridad & OAuth</h3>
                    <p className="text-white/60 text-sm font-medium leading-relaxed">
                        Solo los SUPER ADMIN pueden vincular cuentas sociales. El acceso se gestiona mediante protocolos OAuth oficiales. No almacenamos tus contraseñas, solo tokens de publicación seguros.
                    </p>
                </div>
                <div className="shrink-0 flex gap-4">
                    <div className="text-center">
                        <p className="text-3xl font-black text-indigo-400">{accounts.length}</p>
                        <p className="text-[10px] font-black uppercase text-white/30 tracking-tight">Cuentas Activas</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AccountManager;
