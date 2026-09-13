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
    ExternalLink,
    Star,
    Clock
} from 'lucide-react';
import { toast } from 'sonner';

interface SocialAccount {
    id: string;
    clubId: string;
    club: { id: string; name: string } | null;
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
    /** Si es la cuenta PRINCIPAL del sitio. Lo decide el servidor. */
    isDefault?: boolean;
    createdAt: string;
    updatedAt: string;
}

interface ClubOption {
    id: string;
    name: string;
}

const getUserRole = (): string => {
    try {
        const user = JSON.parse(localStorage.getItem('rotary_user') || '{}');
        return user.role || '';
    } catch { return ''; }
};

const getUserClubId = (): string => {
    try {
        const user = JSON.parse(localStorage.getItem('rotary_user') || '{}');
        return user.clubId || '';
    } catch { return ''; }
};

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
    const [syncing, setSyncing] = useState(false);

    const userRole = getUserRole();
    const isAdmin = userRole === 'administrator';
    const userClubId = getUserClubId();

    // For system admins: the club to attribute new connections to. For non-admins
    // it's fixed to their own club.
    const [selectedClubId, setSelectedClubId] = useState<string>(userClubId);
    const [clubs, setClubs] = useState<ClubOption[]>([]);

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

    // Fetch the clubs list for the admin-only club picker.
    useEffect(() => {
        if (!isAdmin) return;
        (async () => {
            try {
                const token = localStorage.getItem('rotary_token');
                const response = await fetch(`${API}/admin/clubs`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (response.ok) {
                    const data = await response.json();
                    const list: ClubOption[] = Array.isArray(data)
                        ? data.map((c: any) => ({ id: c.id, name: c.name })).filter(c => c.id && c.name)
                        : [];
                    list.sort((a, b) => a.name.localeCompare(b.name));
                    setClubs(list);
                }
            } catch { /* silent */ }
        })();
    }, [isAdmin, API]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        // `meta` es el parámetro desde v4.1043; `social` es el anterior y se
        // sigue leyendo — un callback en vuelo cuando se desplegó esto vuelve
        // con el viejo, y perder su aviso haría creer que no pasó nada.
        const resultado = params.get('meta') || params.get('social');
        if (!resultado) return;

        if (resultado === 'connected') {
            const fb = params.get('fb') || '0';
            const ig = params.get('ig') || '0';
            const revocadas = params.get('revoked') || '';
            toast.success(
                `Meta conectado correctamente. Se sincronizaron ${fb} Página(s) de Facebook y ${ig} cuenta(s) de Instagram.` +
                (Number(revocadas) > 0 ? ` Se retiraron ${revocadas} que ya no autorizaste.` : ''),
                { icon: <CheckCircle2 className="w-4 h-4" />, duration: 8000 }
            );
            fetchAccounts();
        } else if (resultado === 'error') {
            const message = params.get('message') || 'Error desconocido';
            toast.error(`No se pudo conectar Meta: ${decodeURIComponent(message)}`, { duration: 14000 });
        }
        window.history.replaceState({}, document.title, window.location.pathname);
    }, [fetchAccounts]);

    const connectMeta = async () => {
        if (!selectedClubId) {
            toast.error(isAdmin
                ? 'Seleccioná primero el club al que querés asignar las cuentas'
                : 'No tenés un club asociado a tu cuenta');
            return;
        }
        setConnecting(true);
        try {
            const token = localStorage.getItem('rotary_token');
            // El origen viaja para que el callback devuelva a ESTE sitio: el
            // `redirect_uri` de Meta es uno solo y vive en el host de la
            // plataforma, donde esta sesión no existe.
            const response = await fetch(`${API}/social/connect/meta?clubId=${encodeURIComponent(selectedClubId)}&returnOrigin=${encodeURIComponent(window.location.origin)}`, {
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

    // v4.394: Instagram Login directo — para cuentas IG Business/Creator que
    // NO están vinculadas a una Fanpage. Usa el flujo OAuth de api.instagram.com.
    const connectInstagramDirect = async () => {
        if (!selectedClubId) {
            toast.error(isAdmin
                ? 'Seleccioná primero el club al que querés asignar la cuenta de Instagram'
                : 'No tenés un club asociado a tu cuenta');
            return;
        }
        setConnecting(true);
        try {
            const token = localStorage.getItem('rotary_token');
            // El origen viaja para que el callback devuelva a ESTE sitio: el
            // `redirect_uri` de Meta es uno solo y vive en el host de la
            // plataforma, donde esta sesión no existe.
            const response = await fetch(`${API}/social/connect/instagram?clubId=${encodeURIComponent(selectedClubId)}&returnOrigin=${encodeURIComponent(window.location.origin)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok || !data.url) {
                toast.error(data.error || 'No se pudo iniciar OAuth con Instagram');
                return;
            }
            window.location.href = data.url;
        } catch (e: any) {
            toast.error(`Error al iniciar OAuth de Instagram: ${e.message || 'desconocido'}`);
        } finally {
            setConnecting(false);
        }
    };

    // Vuelve a leer de Meta las Páginas y los Instagram del sitio con la
    // autorización que YA existe. Sólo se pide reconectar cuando ese token
    // dejó de servir, y entonces se dice con el motivo que devolvió Meta.
    const syncMeta = async () => {
        if (!selectedClubId) {
            toast.error('Seleccioná primero el sitio a sincronizar');
            return;
        }
        setSyncing(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${API}/social/accounts/sync?clubId=${encodeURIComponent(selectedClubId)}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                toast.error(`${data.error || 'No se pudo sincronizar'}${data.fix ? ` — ${data.fix}` : ''}`, { duration: 12000 });
                return;
            }
            const fb = data.counts?.facebook ?? 0;
            const ig = data.counts?.instagram ?? 0;
            const rev = data.counts?.revoked ?? 0;
            const quien = data.connectedBy?.name ? ` como ${data.connectedBy.name}` : '';
            toast.success(
                `Sincronizado${quien}: ${fb} Página(s) y ${ig} Instagram.` + (rev ? ` ${rev} retirada(s).` : ''),
                { duration: 8000 }
            );
            // ⚠️ LO QUE META DEVOLVIÓ SE DICE, SIEMPRE. La pregunta que trae
            // a alguien a esta pantalla es «marqué mi Página en Facebook y no
            // está»: sin esta línea, la lista corta se lee como un fallo de
            // la plataforma y no como una autorización que no la incluyó.
            toast.info(
                `Meta entregó ${fb} Página(s) para esta autorización. Si falta alguna, pulsá «Conectar Meta`
                + `»: Facebook vuelve a mostrar la lista completa y ahí hay que marcarla —y elegir el `
                + `portafolio de negocio al que pertenece, si lo tiene—.`,
                { duration: 16000 }
            );
            // Las Páginas sin Instagram —y lo que no se pudo leer— se dicen
            // con su motivo: «no conectado» a secas manda a reconectar una
            // cuenta que está bien.
            (data.notes || []).forEach((n: any) => toast.warning(
                `${n.title || n.pageName || 'Meta'}: ${n.reason} ${n.fix || ''}`,
                { duration: 14000 }
            ));
            await fetchAccounts();
        } catch (e: any) {
            toast.error(`Error al sincronizar: ${e.message || 'desconocido'}`);
        } finally {
            setSyncing(false);
        }
    };

    // Cuál es la Página / el Instagram con los que abre marcado «Publicar en
    // redes sociales». Se guarda el ID, nunca el nombre.
    const markDefault = async (acc: SocialAccount) => {
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${API}/social/accounts/defaults?clubId=${encodeURIComponent(acc.clubId)}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ [acc.platform]: acc.isDefault ? null : acc.id })
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) { toast.error(data.error || 'No se pudo guardar'); return; }
            toast.success(acc.isDefault
                ? `@${acc.accountName} ya no es la principal`
                : `@${acc.accountName} es ahora la cuenta principal de ${acc.platform}`);
            await fetchAccounts();
        } catch {
            toast.error('No se pudo guardar la cuenta principal');
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
                <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
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
                    <div className="flex flex-col gap-2 w-full lg:w-auto">
                        {isAdmin && (
                            <div className="w-full lg:w-72">
                                <label className="block text-[10px] font-black uppercase tracking-widest text-white/70 mb-1">Asignar al club</label>
                                <select
                                    value={selectedClubId}
                                    onChange={(e) => setSelectedClubId(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl bg-white/15 text-white text-sm font-bold backdrop-blur-sm border border-white/20 focus:outline-none focus:border-white/60 transition-all"
                                >
                                    <option value="" className="text-gray-800">— Seleccioná club —</option>
                                    {clubs.map(c => (
                                        <option key={c.id} value={c.id} className="text-gray-800">{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <button
                            onClick={connectMeta}
                            disabled={connecting || !selectedClubId}
                            className="bg-white text-blue-700 font-black px-6 py-4 rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100"
                        >
                            {connecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ExternalLink className="w-5 h-5" />}
                            {connecting ? 'INICIANDO...' : 'CONECTAR META'}
                        </button>
                        {/* Volver a leer de Meta lo que YA está autorizado. Se
                            ofrece primero a propósito: mandar a repetir el
                            OAuth cuando la autorización sirve es hacer trabajar
                            de más para resolver algo que se arregla solo. */}
                        <button
                            onClick={syncMeta}
                            disabled={syncing || !selectedClubId}
                            title="Vuelve a leer de Meta las Páginas y los Instagram de este sitio, sin volver a autorizar"
                            className="bg-white/15 text-white font-black px-6 py-3 rounded-2xl backdrop-blur-sm border border-white/25 hover:bg-white/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                            {syncing ? 'SINCRONIZANDO...' : 'SINCRONIZAR CUENTAS'}
                        </button>
                    </div>
                </div>
            </div>

            {/* v4.394: Instagram-direct hero card — para cuentas IG sin Fanpage asociada */}
            <div className="bg-gradient-to-br from-fuchsia-600 via-pink-600 to-orange-500 p-8 rounded-[32px] text-white shadow-2xl">
                <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
                    <div className="w-14 h-14 bg-white/15 rounded-2xl flex items-center justify-center backdrop-blur-sm">
                        <Instagram className="w-7 h-7" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-xl font-black mb-1">¿Tu Instagram no está vinculado a una Fanpage?</h3>
                        <p className="text-white/85 text-sm font-medium leading-relaxed max-w-2xl">
                            Conectá tu cuenta de Instagram <strong>directamente</strong>, sin necesidad de Facebook. Requiere que sea cuenta Business o Creator (no Personal). Se usa el flujo oficial "Instagram Login API for Business".
                        </p>
                    </div>
                    <div className="flex flex-col gap-2 w-full lg:w-auto">
                        <button
                            onClick={connectInstagramDirect}
                            disabled={connecting || !selectedClubId}
                            className="bg-white text-pink-700 font-black px-6 py-4 rounded-2xl shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100"
                        >
                            {connecting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ExternalLink className="w-5 h-5" />}
                            {connecting ? 'INICIANDO...' : 'CONECTAR INSTAGRAM DIRECTO'}
                        </button>
                        {isAdmin && !selectedClubId && (
                            <p className="text-[10px] text-white/70 font-bold text-center">Seleccioná un club arriba</p>
                        )}
                    </div>
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
                                                    {isAdmin && acc.club && (
                                                        <p className="text-[9px] font-bold text-gray-400 truncate mt-0.5">{acc.club.name}</p>
                                                    )}
                                                    {/* ⚠️ EL ID OFICIAL DE META, A LA VISTA. Es lo único
                                                        que permite comprobar que la cuenta conectada es
                                                        la que se autorizó: un nombre se repite entre
                                                        sitios y se renombra en Meta sin avisar. */}
                                                    <p className="text-[9px] font-mono text-gray-400 truncate mt-0.5" title={acc.platformId}>
                                                        {acc.platform === 'instagram' ? 'IG ID' : 'Page ID'}: {acc.platformId}
                                                    </p>
                                                    {acc.platform === 'instagram' && acc.metadata?.linkedPageName && (
                                                        <p className="text-[9px] font-bold text-gray-400 truncate" title={acc.metadata.linkedPageId || ''}>
                                                            vinculada a {acc.metadata.linkedPageName}
                                                        </p>
                                                    )}
                                                    {(acc.metadata?.lastSyncAt || acc.lastVerifiedAt) && (
                                                        <p className="text-[9px] font-bold text-gray-400 truncate mt-0.5 flex items-center gap-1">
                                                            <Clock className="w-2.5 h-2.5" />
                                                            {new Date(acc.metadata?.lastSyncAt || acc.lastVerifiedAt!).toLocaleString()}
                                                        </p>
                                                    )}
                                                    <div className="mt-1 flex items-center gap-1 flex-wrap">
                                                        {statusBadge(acc)}
                                                        {acc.isDefault && (
                                                            <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-1 rounded-md bg-indigo-50 text-indigo-700">
                                                                <Star className="w-3 h-3 fill-current" /> PRINCIPAL
                                                            </span>
                                                        )}
                                                    </div>
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
                                                    onClick={() => markDefault(acc)}
                                                    title={acc.isDefault
                                                        ? 'Quitar como cuenta principal'
                                                        : 'Marcar como cuenta principal: es con la que abre marcado «Publicar en redes sociales»'}
                                                    className={`py-1.5 px-2 rounded-lg bg-white border transition-all ${acc.isDefault ? 'border-indigo-200 text-indigo-600' : 'border-gray-100 text-gray-400 hover:text-indigo-600 hover:border-indigo-200'}`}
                                                >
                                                    <Star className={`w-3 h-3 ${acc.isDefault ? 'fill-current' : ''}`} />
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
