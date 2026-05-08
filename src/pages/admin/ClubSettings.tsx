import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useClub } from '../../contexts/ClubContext';
import { useAuth } from '../../hooks/useAuth';
import { 
    Save, Globe, MessageSquare, Phone, Palette, Upload, 
    Image as ImageIcon, Store, Dna, Settings as SettingsIcon, 
    CreditCard, ExternalLink, Sparkles, Layout, Mail, 
    MapPin, Share2, Info, Building2, Bot, ChevronRight, RefreshCw,
    Facebook, Instagram, Twitter, Linkedin, Youtube
} from 'lucide-react';
import { toast } from 'sonner';
import ClubArchetypeCard from '../../components/admin/ClubArchetypeCard';
import SiteSetupCard from '../../components/admin/SiteSetupCard';
import { getAutoCropCanvas, fileToImage, canvasToFile } from '../../utils/cropUtils';
import { useNavigate } from 'react-router-dom';

const ClubSettings: React.FC = () => {
    const { club, refreshClub } = useClub();
    const { user } = useAuth();
    const navigate = useNavigate();
    const isSuperAdmin = user?.role === 'administrator';

    const [activeTab, setActiveTab] = useState<'estado' | 'identidad' | 'avanzado' | 'facturacion'>('estado');
    const [stats, setStats] = useState<any>(null);

    const [formData, setFormData] = useState({
        name: '',
        description: '',
        city: '',
        country: '',
        domain: '',
        subdomain: '',
        email: '',
        phone: '',
        address: '',
        socialLinks: [] as { platform: string, url: string }[],
        primaryColor: '#013388',
        secondaryColor: '#E29C00',
        logo: '',
        footerLogo: '',
        endPolioLogo: '',
        rotaractLogo: '',
        interactLogo: '',
        youthExchangeLogo: '',
        favicon: '',
        logoHeaderSize: 200,
        autoGenerateCalendar: true,
        mapStyle: 'm',
        storeActive: true,
    });
    
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(false);

    // Payment config state
    const [useStripe, setUseStripe] = useState(false);
    const [stripePublicKey, setStripePublicKey] = useState('');
    const [stripeSecretKey, setStripeSecretKey] = useState('');

    const [mapStyle, setMapStyle] = useState<string>('m');
    const [savingMap, setSavingMap] = useState(false);

    const [platformLogo, setPlatformLogo] = useState<string>('');
    const [platformLogoSize, setPlatformLogoSize] = useState<number>(48);
    const [saasRedirect, setSaasRedirect] = useState(false);
    const [updatingRedirect, setUpdatingRedirect] = useState(false);

    const API_URL = import.meta.env.VITE_API_URL || '/api';

    useEffect(() => {
        const token = localStorage.getItem('rotary_token');
        fetch(`${API_URL}/admin/stats`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(setStats)
            .catch(() => { });
    }, []);

    useEffect(() => {
        if (isSuperAdmin) {
            fetch(`${API_URL}/platform-config/logo`)
                .then(r => r.json())
                .then(data => {
                    if (data.url) setPlatformLogo(data.url);
                    if (data.size) setPlatformLogoSize(data.size);
                    if (data.saasRedirect !== undefined) setSaasRedirect(data.saasRedirect);
                })
                .catch(() => {});
            
            const token = localStorage.getItem('rotary_token');
            fetch(`${API_URL}/admin/global-map-style`, { headers: { Authorization: `Bearer ${token}` } })
                .then(r => r.json())
                .then(data => setMapStyle(data.mapStyle || 'm'))
                .catch(() => { });
        }
    }, [isSuperAdmin]);

    useEffect(() => {
        if (club) {
            // Map settings to flat fields
            const settingsMap: any = {};
            if (club.settings) {
                if (Array.isArray(club.settings)) {
                    club.settings.forEach((s: any) => settingsMap[s.key] = s.value);
                } else {
                    Object.assign(settingsMap, club.settings);
                }
            }

            setFormData({
                name: club.name || '',
                description: club.description || '',
                city: club.city || '',
                country: club.country || '',
                domain: club.domain || '',
                subdomain: club.subdomain || '',
                email: club.contact?.email || settingsMap['contact_email'] || '',
                phone: club.contact?.phone || settingsMap['contact_phone'] || '',
                address: club.contact?.address || settingsMap['contact_address'] || '',
                socialLinks: Array.isArray(club.social) ? club.social : [],
                primaryColor: club.colors?.primary || '#013388',
                secondaryColor: club.colors?.secondary || '#E29C00',
                logo: club.logo || '',
                footerLogo: club.footerLogo || '',
                endPolioLogo: club.endPolioLogo || '',
                rotaractLogo: settingsMap['rotaract_logo'] || '',
                interactLogo: settingsMap['interact_logo'] || '',
                youthExchangeLogo: settingsMap['youth_exchange_logo'] || '',
                favicon: club.favicon || '',
                logoHeaderSize: club.logoHeaderSize ?? 200,
                autoGenerateCalendar: settingsMap['auto_generate_calendar'] !== 'false',
                mapStyle: club.mapStyle || 'm',
                storeActive: settingsMap['store_active'] !== 'false',
            });

            if (club.paymentConfigs && Array.isArray(club.paymentConfigs)) {
                const stripeConfig = club.paymentConfigs.find((c: any) => c.provider === 'stripe');
                setUseStripe(stripeConfig?.enabled || false);
                setStripePublicKey(stripeConfig?.publicKey || '');
            }
        }

        // Logic to refresh if coming back from Stripe
        const params = new URLSearchParams(window.location.search);
        if (params.get('refresh') === 'true') {
            const tId = toast.loading('Verificando pago y actualizando suscripción...');
            
            // Refrescar cada 2 segundos por 6 segundos máximo
            const interval = setInterval(async () => {
                await refreshClub();
            }, 2000);

            setTimeout(() => {
                clearInterval(interval);
                toast.dismiss(tId);
                toast.success('Información de suscripción actualizada');
                // Limpiar la URL sin recargar
                window.history.replaceState({}, '', window.location.pathname);
            }, 6500);
        }
    }, [club]);

    const handleAutoCrop = async (file: File): Promise<File> => {
        try {
            const img = await fileToImage(file);
            const canvas = getAutoCropCanvas(img);
            if (canvas) return await canvasToFile(canvas, file.name.replace(/\.[^.]+$/, '.png'));
            return file;
        } catch (error) {
            return file;
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, folder: string, fieldName: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const croppedFile = await handleAutoCrop(file);
            const uploadData = new FormData();
            uploadData.append('file', croppedFile);
            uploadData.append('folder', folder);

            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${API_URL}/media/upload?folder=${folder}&clubId=${club?.id}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: uploadData
            });

            if (response.ok) {
                const data = await response.json();
                setFormData(prev => ({ ...prev, [fieldName]: data.url }));
                toast.success('Imagen subida con éxito');
            } else {
                throw new Error('Falla en el servidor');
            }
        } catch (error: any) {
            toast.error(`Error al subir: ${error.message}`);
        } finally {
            setUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleSave = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            
            // If superadmin, also save platform-wide settings
            if (isSuperAdmin) {
                // Save platform logo size
                const sizeRes = await fetch(`${API_URL}/platform-config/logo/size`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ size: platformLogoSize })
                });
                if (!sizeRes.ok) {
                    const err = await sizeRes.json();
                    throw new Error(`Logo Size: ${err.error || 'Error'}`);
                }

                // Save SaaS redirect
                const redRes = await fetch(`${API_URL}/platform-config/redirect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ active: saasRedirect })
                });
                if (!redRes.ok) {
                    const err = await redRes.json();
                    throw new Error(`Redirect Config: ${err.error || 'Error'}`);
                }
            }

            const response = await fetch(`${API_URL}/admin/clubs/${club?.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                toast.success('Configuración actualizada');
                setTimeout(() => window.location.reload(), 1000);
            } else {
                const errData = await response.json();
                throw new Error(errData.error || 'Error al actualizar club');
            }
        } catch (error: any) {
            console.error('Save error:', error);
            toast.error(error.message || 'Hubo un error al guardar los cambios');
        } finally {
            setLoading(false);
        }
    };

    const handleOpenBillingPortal = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${API_URL}/admin/clubs/${club?.id}/billing-portal`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                if (data.url) window.location.href = data.url;
            } else {
                const errData = await res.json().catch(() => ({}));
                toast.error(errData.error || 'No se pudo abrir el portal de pagos.');
            }
        } catch (error) {
            toast.error('Error de red al intentar abrir el portal.');
        }
    };

    const TABS = [
        { id: 'estado', label: 'Estado', icon: Sparkles },
        { id: 'identidad', label: 'Identidad', icon: Building2 },
        ...(isSuperAdmin ? [{ id: 'avanzado', label: 'Avanzado', icon: SettingsIcon }] : []),
        { id: 'facturacion', label: 'Facturación', icon: CreditCard },
    ] as const;

    if (!club) return <AdminLayout><div className="p-12 text-center text-gray-500 italic">Cargando...</div></AdminLayout>;

    return (
        <AdminLayout>
            <div className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                        Configuración <span className="text-rotary-blue font-light">/ {TABS.find(t => t.id === activeTab)?.label}</span>
                    </h1>
                    <p className="text-sm text-gray-400 font-medium mt-1">Gestiona todo lo relacionado con tu sitio y organización en un solo lugar.</p>
                </div>
                <button
                    onClick={() => handleSave()}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 bg-rotary-blue text-white px-6 py-2.5 rounded-xl font-bold hover:bg-sky-800 transition-all shadow-lg shadow-rotary-blue/20 disabled:opacity-50"
                >
                    <Save className="w-5 h-5" /> {loading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-2xl mb-8 w-fit">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                            activeTab === tab.id 
                                ? 'bg-white text-gray-900 shadow-sm' 
                                : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                        }`}
                    >
                        <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-rotary-blue' : 'text-gray-400'}`} />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="space-y-8 pb-24">
                {activeTab === 'estado' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <SiteSetupCard stats={stats} onOpenWizard={() => navigate('/admin/onboarding')} />
                        
                        {/* Summary DNA if available */}
                        {club.archetype && (
                            <div className="mt-8">
                                <div className="flex bg-white rounded-t-3xl border-x border-t border-gray-100 px-8 py-5 items-center gap-3">
                                    <Dna className="w-6 h-6 text-rotary-blue" />
                                    <div>
                                        <h2 className="text-xl font-black text-gray-800 tracking-tight">ADN de tu Club</h2>
                                        <p className="text-xs text-gray-500 font-medium mt-0.5">Perfil estratégico generado por IA.</p>
                                    </div>
                                </div>
                                <div className="bg-white border-x border-b border-gray-100 rounded-b-3xl p-8 pt-4 shadow-sm">
                                    <ClubArchetypeCard 
                                        result={club.archetype} 
                                        clubName={club.name} 
                                        clubColors={{ 
                                            primary: formData.primaryColor, 
                                            secondary: formData.secondaryColor 
                                        }}
                                        hideCTAs={true} 
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'identidad' && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Basic Info */}
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-3">
                                <Layout className="w-5 h-5 text-rotary-blue" /> Información Institucional
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2 space-y-1">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Nombre</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all font-medium"
                                        value={formData.name}
                                        onChange={e => setFormData({...formData, name: e.target.value})}
                                    />
                                </div>
                                <div className="md:col-span-2 space-y-1">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Descripción / Misión</label>
                                    <textarea
                                        rows={3}
                                        className="w-full px-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all font-medium resize-none"
                                        value={formData.description}
                                        onChange={e => setFormData({...formData, description: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Ciudad</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all font-medium"
                                        value={formData.city}
                                        onChange={e => setFormData({...formData, city: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">País</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all font-medium"
                                        value={formData.country}
                                        onChange={e => setFormData({...formData, country: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Logos */}
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-3">
                                <ImageIcon className="w-5 h-5 text-rotary-blue" /> Logos y Favicon
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block text-center">Logo Header (Principal)</label>
                                    <div className="relative group mx-auto w-40 h-40">
                                        <div className="w-40 h-40 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden transition-all group-hover:border-rotary-blue/40">
                                            {formData.logo ? <img src={formData.logo} className="w-full h-full object-contain p-4" /> : <Building2 className="w-12 h-12 text-gray-300" />}
                                        </div>
                                        <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-2xl">
                                            <Upload className="text-white w-8 h-8" />
                                            <input type="file" className="hidden" onChange={e => handleFileUpload(e, 'logos', 'logo')} accept="image/*" />
                                        </label>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-[10px] font-bold text-gray-400">
                                            <span>Tamaño: {formData.logoHeaderSize}px</span>
                                        </div>
                                        <input
                                            type="range" min={60} max={300} step={5}
                                            value={formData.logoHeaderSize}
                                            onChange={e => setFormData({...formData, logoHeaderSize: Number(e.target.value)})}
                                            className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-rotary-blue"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block text-center">Logo Footer</label>
                                    <div className="relative group mx-auto w-40 h-40">
                                        <div className="w-40 h-40 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden transition-all group-hover:border-rotary-blue/40">
                                            {formData.footerLogo ? <img src={formData.footerLogo} className="w-full h-full object-contain p-4" /> : <Building2 className="w-12 h-12 text-gray-300" />}
                                        </div>
                                        <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-2xl">
                                            <Upload className="text-white w-8 h-8" />
                                            <input type="file" className="hidden" onChange={e => handleFileUpload(e, 'logos-footer', 'footerLogo')} accept="image/*" />
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block text-center">Favicon (32x32)</label>
                                    <div className="relative group mx-auto w-40 h-40">
                                        <div className="w-40 h-40 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden transition-all group-hover:border-rotary-blue/40">
                                            {formData.favicon ? <img src={formData.favicon} className="w-8 h-8 object-contain" /> : <Globe className="w-8 h-8 text-gray-300" />}
                                        </div>
                                        <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-2xl">
                                            <Upload className="text-white w-8 h-8" />
                                            <input type="file" className="hidden" onChange={e => handleFileUpload(e, 'favicons', 'favicon')} accept="image/*" />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Contact and Social */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-3">
                                    <Mail className="w-5 h-5 text-emerald-500" /> Contacto Oficial
                                </h3>
                                <div className="space-y-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-400 uppercase">Email</label>
                                        <input
                                            type="email"
                                            className="w-full px-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all font-medium"
                                            value={formData.email}
                                            onChange={e => setFormData({...formData, email: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-400 uppercase">Teléfono</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all font-medium"
                                            value={formData.phone}
                                            onChange={e => setFormData({...formData, phone: e.target.value})}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-gray-400 uppercase">Dirección</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all font-medium"
                                            value={formData.address}
                                            onChange={e => setFormData({...formData, address: e.target.value})}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-3">
                                    <Share2 className="w-5 h-5 text-indigo-500" /> Presencia Digital
                                </h3>
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                                        <Store className="w-5 h-5 text-rotary-blue" />
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-gray-700">Activar Tienda Pública</p>
                                            <p className="text-[10px] text-gray-400">Habilita el módulo de aportes y recaudación</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setFormData({...formData, storeActive: !formData.storeActive})}
                                            className={`w-10 h-6 rounded-full transition-all relative ${formData.storeActive ? 'bg-rotary-blue' : 'bg-gray-300'}`}
                                        >
                                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${formData.storeActive ? 'left-5' : 'left-1'}`} />
                                        </button>
                                    </div>
                                    <div className="pt-4 border-t border-gray-100 space-y-4">
                                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest px-2">Redes Sociales</p>
                                        
                                        {[
                                            { id: 'facebook', label: 'Facebook', icon: Facebook, color: 'text-blue-600' },
                                            { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'text-pink-600' },
                                            { id: 'twitter', label: 'X (Twitter)', icon: Twitter, color: 'text-gray-900' },
                                            { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'text-blue-700' },
                                            { id: 'youtube', label: 'YouTube', icon: Youtube, color: 'text-red-600' },
                                        ].map(plat => {
                                            const existing = formData.socialLinks.find(s => s.platform === plat.id);
                                            return (
                                                <div key={plat.id} className="relative group">
                                                    <plat.icon className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 ${plat.color}`} />
                                                    <input
                                                        type="text"
                                                        placeholder={`URL de ${plat.label}`}
                                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all text-xs font-medium"
                                                        value={existing?.url || ''}
                                                        onChange={e => {
                                                            const val = e.target.value;
                                                            if (existing) {
                                                                setFormData({
                                                                    ...formData,
                                                                    socialLinks: formData.socialLinks.map(s => s.platform === plat.id ? { ...s, url: val } : s)
                                                                });
                                                            } else {
                                                                setFormData({
                                                                    ...formData,
                                                                    socialLinks: [...formData.socialLinks, { platform: plat.id, url: val }]
                                                                });
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'avanzado' && isSuperAdmin && (
                    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {/* Domain Management */}
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-3">
                                <Globe className="w-5 h-5 text-emerald-600" /> Ecosistema y Dominio
                            </h3>
                            <div className="max-w-2xl space-y-6">
                                <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Dominio Personalizado</label>
                                    <div className="flex gap-3">
                                        <div className="relative flex-1">
                                            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="text"
                                                className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl outline-none focus:border-rotary-blue transition-all"
                                                value={formData.domain}
                                                onChange={e => setFormData({...formData, domain: e.target.value.toLowerCase()})}
                                                placeholder="ej: rotaryclub.org"
                                            />
                                        </div>
                                        <button 
                                            type="button"
                                            className="px-6 py-3 bg-gray-800 text-white rounded-xl font-bold text-sm hover:bg-black transition-colors"
                                            onClick={() => toast.info('Validando configuración DNS...')}
                                        >
                                            Verificar
                                        </button>
                                    </div>
                                    {formData.domain && (
                                        <div className="mt-4 p-4 bg-emerald-50 border border-emerald-100 rounded-xl">
                                            <p className="text-xs text-emerald-800 font-bold mb-2">Instrucciones DNS:</p>
                                            <code className="text-[10px] block bg-white p-2 rounded border border-emerald-200 font-mono">
                                                Tipo A | Host @ | Valor 76.76.21.21
                                            </code>
                                        </div>
                                    )}
                                </div>

                                {isSuperAdmin && (
                                    <div className="p-6 bg-purple-50 rounded-2xl border border-purple-100 space-y-6">
                                        <h4 className="font-bold text-purple-900 flex items-center gap-2">
                                            <Sparkles className="w-4 h-4" /> Configuración de Plataforma (Exclusivo SuperAdmin)
                                        </h4>
                                        
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="space-y-4">
                                                <label className="text-xs font-bold text-purple-700 uppercase tracking-wider block">Logo de Plataforma (Login & Admin)</label>
                                                <div className="relative group mx-auto w-32 h-32">
                                                    <div className="w-32 h-32 rounded-2xl bg-white border-2 border-dashed border-purple-200 flex items-center justify-center overflow-hidden transition-all group-hover:border-purple-400">
                                                        {platformLogo ? (
                                                            <img src={platformLogo} className="w-full h-full object-contain p-3" />
                                                        ) : (
                                                            <img src="/images/platform_logo_premium.png" className="w-full h-full object-contain p-3 opacity-50 grayscale" />
                                                        )}
                                                    </div>
                                                    <label className="absolute inset-0 flex items-center justify-center bg-purple-900/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-2xl">
                                                        <Upload className="text-white w-6 h-6" />
                                                        <input 
                                                            type="file" 
                                                            className="hidden" 
                                                            accept="image/*"
                                                            onChange={async (e) => {
                                                                const file = e.target.files?.[0];
                                                                if (!file) return;
                                                                setUploading(true);
                                                                try {
                                                                    const token = localStorage.getItem('rotary_token');
                                                                    const formData = new FormData();
                                                                    formData.append('file', file);
                                                                    const res = await fetch(`${API_URL}/platform-config/logo/upload`, {
                                                                        method: 'POST',
                                                                        headers: { Authorization: `Bearer ${token}` },
                                                                        body: formData
                                                                    });
                                                                    if (res.ok) {
                                                                        const data = await res.json();
                                                                        setPlatformLogo(data.url);
                                                                        toast.success('Logo de plataforma actualizado');
                                                                    }
                                                                } catch {
                                                                    toast.error('Error al subir logo de plataforma');
                                                                } finally {
                                                                    setUploading(false);
                                                                }
                                                            }} 
                                                        />
                                                    </label>
                                                </div>
                                            </div>

                                            <div className="space-y-6">
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold text-purple-700 uppercase">Tamaño del Logo: {platformLogoSize}px</label>
                                                    <input
                                                        type="range" min={24} max={120} step={2}
                                                        value={platformLogoSize}
                                                        onChange={e => setPlatformLogoSize(Number(e.target.value))}
                                                        className="w-full h-1.5 bg-purple-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                                    />
                                                </div>

                                                <div className="flex items-center justify-between pt-4 border-t border-purple-100">
                                                    <div>
                                                        <p className="text-sm font-bold text-purple-900">Redirección SaaS</p>
                                                        <p className="text-[10px] text-purple-700">Envía a los usuarios del home a la app directamente</p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setSaasRedirect(!saasRedirect)}
                                                        className={`w-12 h-6 rounded-full transition-all relative ${saasRedirect ? 'bg-purple-600' : 'bg-gray-300'}`}
                                                    >
                                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${saasRedirect ? 'left-7' : 'left-1'}`} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Visual Theme */}
                        <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-3">
                                <Palette className="w-5 h-5 text-rotary-blue" /> Estética y Colores
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-gray-400 uppercase">Color Primario</label>
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="color"
                                            value={formData.primaryColor}
                                            onChange={e => setFormData({...formData, primaryColor: e.target.value})}
                                            className="w-12 h-12 rounded-xl cursor-pointer border-none"
                                        />
                                        <input
                                            type="text"
                                            value={formData.primaryColor}
                                            onChange={e => setFormData({...formData, primaryColor: e.target.value})}
                                            className="flex-1 px-4 py-2 bg-gray-50 rounded-lg text-sm font-mono font-bold"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <label className="text-xs font-bold text-gray-400 uppercase">Color Secundario (Botones/Acentos)</label>
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="color"
                                            value={formData.secondaryColor}
                                            onChange={e => setFormData({...formData, secondaryColor: e.target.value})}
                                            className="w-12 h-12 rounded-xl cursor-pointer border-none"
                                        />
                                        <input
                                            type="text"
                                            value={formData.secondaryColor}
                                            onChange={e => setFormData({...formData, secondaryColor: e.target.value})}
                                            className="flex-1 px-4 py-2 bg-gray-50 rounded-lg text-sm font-mono font-bold"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'facturacion' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-10 rounded-[2rem] shadow-2xl border border-gray-700 text-white relative overflow-hidden">
                            <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-rotary-blue opacity-10 rounded-full blur-3xl animate-pulse"></div>
                            <div className="relative z-10">
                                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mb-8 backdrop-blur-xl border border-white/10">
                                    <CreditCard className="w-8 h-8 text-rotary-gold" />
                                </div>
                                <h3 className="text-3xl font-black mb-4">Portal de Facturación y Suscripción</h3>
                                <p className="text-gray-300 text-lg mb-10 max-w-2xl leading-relaxed">
                                    Accede a tu historial de pagos, descarga facturas legales y gestiona tus métodos de pago de forma segura a través de Stripe.
                                </p>
                                <div className="flex flex-col sm:flex-row gap-4">
                                    <button
                                        type="button"
                                        onClick={handleOpenBillingPortal}
                                        className="bg-white text-gray-900 hover:bg-rotary-gold hover:text-white px-8 py-4 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-3 shadow-xl active:scale-95"
                                    >
                                        Ir al Portal Seguro <ExternalLink className="w-5 h-5" />
                                    </button>
                                    <div className="flex items-center gap-4 px-6 py-4 bg-white/5 rounded-2xl border border-white/10">
                                        <div className={`w-2 h-2 rounded-full ${(club.subscriptionStatus === 'active' && !club.expirationBannerActive) ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></div>
                                        <span className="text-sm font-bold text-gray-300 uppercase tracking-widest">
                                            Suscripción {(club.subscriptionStatus === 'active' && !club.expirationBannerActive) ? 'Activa' : 'Vencida'}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => refreshClub()}
                                        className="p-4 bg-white/5 rounded-2xl border border-white/10 hover:bg-white/10 transition-all text-gray-400 hover:text-white"
                                        title="Actualizar estado"
                                    >
                                        <RefreshCw className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[
                                { title: 'Facturas', desc: 'Descarga comprobantes fiscales automáticos.' },
                                { title: 'Métodos de Pago', desc: 'Actualiza tarjetas de crédito o débito.' },
                                { title: 'Planes', desc: 'Gestiona la renovación de tu plataforma.' }
                            ].map((item, idx) => (
                                <div key={idx} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                                    <h4 className="font-bold text-gray-800 mb-2">{item.title}</h4>
                                    <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom sticky bar for save when in identity/advanced */}
            {(activeTab === 'identidad' || activeTab === 'avanzado') && (
                <div className="fixed bottom-0 left-0 lg:left-72 right-0 bg-white/80 backdrop-blur-xl border-t border-gray-100 p-4 z-40 flex items-center justify-between px-8 animate-in slide-in-from-bottom-full duration-300">
                    <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></div>
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tienes cambios sin guardar</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 transition-all"
                        >
                            Descartar
                        </button>
                        <button
                            onClick={() => handleSave()}
                            disabled={loading}
                            className="bg-rotary-blue text-white px-8 py-2.5 rounded-xl font-bold text-sm hover:bg-sky-800 shadow-lg shadow-rotary-blue/20 transition-all flex items-center gap-2"
                        >
                            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                            Guardar Configuración
                        </button>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default ClubSettings;
