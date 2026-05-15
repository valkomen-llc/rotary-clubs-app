import React, { useEffect, useState, useCallback } from 'react';
import {
    Instagram,
    Facebook,
    Linkedin,
    Twitter,
    Loader2,
    CheckCircle2,
    XCircle,
    AlertCircle,
    LogOut,
    ShieldCheck,
    RefreshCw,
    ExternalLink
} from 'lucide-react';
import { toast } from 'sonner';

interface SocialAccount {
    id: string;
    clubId: string;
    platform: 'facebook' | 'instagram' | 'linkedin' | 'x';
    platformId: string;
    pageId: string | null;
    accountName: string | null;
    avatar: string | null;
    status: 'active' | 'expired' | 'revoked' | 'error';
    permissions: string[];
    metadata: Record<string, any>;
    lastVerifiedAt: string | null;
    expiresAt: string | null;
    needsReconnect: boolean;
    createdAt: string;
    updatedAt: string;
}

interface PlatformMeta {
    id: 'facebook' | 'instagram' | 'linkedin' | 'x';
    name: string;
    icon: React.FC<{ className?: string }>;
    color: string;
    bg: string;
    available: boolean;
    note?: string;
}

const PLATFORMS: PlatformMeta[] = [
    { id: 'facebook',  name: 'Facebook Pages',  icon: Facebook,  color: 'text-blue-600',    bg: 'bg-blue-50',    available: true },
    { id: 'instagram', name: 'Instagram',       icon: Instagram, color: 'text-pink-600',    bg: 'bg-pink-50',    available: true, note: 'Se conecta junto con Facebook' },
    { id: 'linkedin',  name: 'LinkedIn',        icon: Linkedin,  color: 'text-sky-700',     bg: 'bg-sky-50',     available: false, note: 'Próximamente — Fase 2' },
    { id: 'x',         name: 'X (Twitter)',     icon: Twitter,   color: 'text-slate-900',   bg: 'bg-slate-50',   available: false, note: 'Próximamente — Fase 3' }
];

const AccountManager: React.FC = () => {
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [actioningId, setActioningId] = useState<string | null>(null);
    const [connecting, setConnecting] = useState(false);

    const API = import.meta.env.VITE_API_URL || '/api';

    const fetchAccounts = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${API}/social/accounts`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                const data = await response.json();
                setAccounts(data);
            } else {
                const err = await response.json().catch(() => ({}));
                toast.error(err.error || 'Error al cargar cuentas');
            }
        } catch {
            toast.error('Error de conexión al cargar cuentas');
        } finally {
            setLoading(false);
        }
    }, [API]);

    useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const social = params.get('social');
        if (!social) return;

        if (social === 'connected') {
            const fb = params.get('fb') || '0';
            const ig = params.get('ig') || '0';
            toast.success(`Meta conectado: ${fb} página(s) de Facebook + ${ig} Instagram Business`, {
                icon: <CheckCircle2 className="w-4 h-4" />,
                duration: 6000
            });
            fetchAccounts();
        } else if (social === 'error') {
            const message = params.get('message') || 'Error desconocido';
            toast.error(`Error al conectar Meta: ${decodeURIComponent(message)}`, { duration: 12000 });
        }
        window.history.replaceState({}, document.title, window.location.pathname);
    }, [fetchAccounts]);

    const connectMeta = async () => {
        setConnecting(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const clubData = JSON.parse(localStorage.getItem('rotary_club') || '{}');
            const clubId = clubData.id || '';
            const response = await fetch(`${API}/social/connect/meta?clubId=${encodeURIComponent(clubId)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok || !data.url) {
                toast.error(data.error || 'No se pudo iniciar OAuth con Meta');
                return;
            }
            window.location.href = data.url;
        } catch (e: any) {
            toast.error(`Error al iniciar OAuth: ${e.message || 'desconocido'}`);
        } finally {
            setConnecting(false);
        }
    };

    const verifyAcc = async (acc: SocialAccount) => {
        setActioningId(acc.id);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${API}/social/accounts/${acc.id}/verify`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (data.status === 'active') toast.success(`Cuenta @${acc.accountName} verificada`);
            else if (data.status === 'needs_reconnect') toast.warning('Esta cuenta usa un token legacy. Reconectá Meta para actualizarla.');
            else toast.error(`Token inválido para @${acc.accountName}. Reconectá.`);
            await fetchAccounts();
        } catch {
            toast.error('Error al verificar la cuenta');
        } finally {
            setActioningId(null);
        }
    };

    const disconnectAcc = async (acc: SocialAccount) => {
        if (!window.confirm(`¿Desconectar @${acc.accountName}? Vas a poder reconectarla más tarde.`)) return;
        setActioningId(acc.id);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${API}/social/accounts/${acc.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (response.ok) {
                toast.success(`@${acc.accountName} desconectada`);
                await fetchAccounts();
            } else {
                const err = await response.json().catch(() => ({}));
                toast.error(err.error || 'Error al desconectar');
            }
        } finally {
            setActioningId(null);
        }
    };

    const statusBadge = (acc: SocialAccount) => {
        if (acc.needsReconnect) {
            return <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-md bg-amber-50 text-amber-700"><AlertCircle className="w-3 h-3" /> RECONECTAR</span>;
        }
        if (acc.status === 'active') {
            return <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-md bg-green-50 text-green-700"><CheckCircle2 className="w-3 h-3" /> ACTIVA</span>;
        }
        if (acc.status === 'expired') {
            return <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-md bg-red-50 text-red-700"><XCircle className="w-3 h-3" /> EXPIRADA</span>;
        }
        return <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-md bg-gray-100 text-gray-600">{acc.status.toUpperCase()}</span>;
    };

    const accountsByPlatform = (id: string) => accounts.filter(a => a.platform === id);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Meta hero connect card */}
            <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-pink-600 p-8 rounded-[32px] text-white shadow-2xl">
                <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                    <div className="flex items-center gap-3">
                        <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                            <Facebook className="w-7 h-7" />
                        </div>
                        <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                            <Instagram className="w-7 h-7" />
                        </div>
                    </div>
                    <div className="flex-1">
                        <h3 className="text-xl font-black mb-1">Conectar Facebook & Instagram</h3>
                        <p className="text-white/80 text-sm font-medium leading-relaxed max-w-2xl">
                            Un solo flujo de OAuth te conecta TODAS las Páginas de Facebook que administras + sus cuentas de Instagram Business vinculadas. Necesario para publicar en Fase 2.
                        </p>
                    </div>
                    <button
                        onClick={connectMeta}
                        disabled={connecting}
                        className="bg-white text-blue-700 font-black px-6 py-4 rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:hover:scale-100"
                    >
                        {connecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ExternalLink className="w-5 h-5" />}
                        {connecting ? 'INICIANDO...' : 'CONECTAR META'}
                    </button>
                </div>
            </div>

            {/* Connected accounts per platform */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {PLATFORMS.map((platform) => {
                    const connected = accountsByPlatform(platform.id);
                    return (
                        <div key={platform.id} className={`bg-white p-6 rounded-[28px] border shadow-sm flex flex-col ${platform.available ? 'border-gray-100' : 'border-gray-50 opacity-60'}`}>
                            <div className="flex items-center gap-3 mb-4">
                                <div className={`w-12 h-12 ${platform.bg} ${platform.color} rounded-2xl flex items-center justify-center shadow-sm`}>
                                    <platform.icon className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-black text-gray-900 text-sm leading-tight">{platform.name}</h3>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
                                        {connected.length > 0
                                            ? `${connected.length} cuenta${connected.length !== 1 ? 's' : ''}`
                                            : platform.available ? 'Sin conexión' : 'Próximamente'}
                                    </p>
                                </div>
                            </div>

                            {!platform.available && (
                                <div className="bg-gray-50 rounded-xl p-3 text-[10px] font-bold text-gray-400 text-center">
                                    {platform.note}
                                </div>
                            )}

                            {platform.available && connected.length === 0 && (
                                <div className="bg-gray-50 rounded-xl p-3 text-[10px] font-bold text-gray-400 text-center">
                                    {platform.note || 'Conectá Meta arriba para sumar cuentas'}
                                </div>
                            )}

                            {connected.length > 0 && (
                                <div className="space-y-2 mt-2">
                                    {connected.map(acc => (
                                        <div key={acc.id} className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                                            <div className="flex items-start gap-2 mb-2">
                                                {acc.avatar
                                                    ? <img src={acc.avatar} alt="" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
                                                    : <div className="w-8 h-8 rounded-lg bg-gray-200 flex-shrink-0" />}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-black text-gray-800 truncate">{acc.accountName || acc.platformId}</p>
                                                    <div className="mt-1">{statusBadge(acc)}</div>
                                                </div>
                                            </div>
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => verifyAcc(acc)}
                                                    disabled={actioningId === acc.id}
                                                    title="Verificar token"
                                                    className="flex-1 py-1.5 rounded-lg bg-white border border-gray-100 text-[9px] font-black text-gray-600 hover:bg-gray-100 transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                                                >
                                                    {actioningId === acc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                                    VERIFICAR
                                                </button>
                                                <button
                                                    onClick={() => disconnectAcc(acc)}
                                                    disabled={actioningId === acc.id}
                                                    title="Desconectar"
                                                    className="py-1.5 px-2 rounded-lg bg-white border border-gray-100 text-gray-400 hover:text-red-600 hover:border-red-200 transition-all disabled:opacity-50"
                                                >
                                                    <LogOut className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Info / security panel */}
            <div className="bg-gradient-to-r from-gray-900 to-indigo-950 p-8 rounded-[32px] text-white flex flex-col md:flex-row items-center gap-8 border border-white/10 shadow-2xl">
                <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm shrink-0">
                    <ShieldCheck className="w-10 h-10 text-indigo-400" />
                </div>
                <div className="flex-1">
                    <h3 className="text-xl font-black mb-2">Seguridad & OAuth</h3>
                    <p className="text-white/60 text-sm font-medium leading-relaxed">
                        Los tokens se cifran con AES-256-GCM antes de guardarse. Solo administradores pueden vincular o desvincular cuentas. Conectamos vía OAuth oficial de Meta — nunca pedimos tu contraseña.
                    </p>
                </div>
                <div className="shrink-0 flex gap-6 text-center">
                    <div>
                        <p className="text-3xl font-black text-indigo-400">{accounts.filter(a => a.status === 'active' && !a.needsReconnect).length}</p>
                        <p className="text-[10px] font-black uppercase text-white/30 tracking-tight">Activas</p>
                    </div>
                    <div>
                        <p className="text-3xl font-black text-amber-400">{accounts.filter(a => a.needsReconnect || a.status !== 'active').length}</p>
                        <p className="text-[10px] font-black uppercase text-white/30 tracking-tight">Reconectar</p>
                    </div>
                </div>
            </div>

            {loading && (
                <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 text-gray-300 animate-spin" />
                </div>
            )}
        </div>
    );
};

export default AccountManager;
