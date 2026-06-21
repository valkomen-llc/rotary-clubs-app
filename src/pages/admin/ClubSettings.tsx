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
import WhatsAppConfig from '../../components/admin/whatsapp/WhatsAppConfig';
import SystemCommunicationsConfig from '../../components/admin/SystemCommunicationsConfig';

const ClubSettings: React.FC = () => {
    const { club, refreshClub } = useClub();
    const { user } = useAuth();
    const navigate = useNavigate();
    const isSuperAdmin = user?.role === 'administrator';

    type TabType = 'estado' | 'identidad' | 'avanzado' | 'facturacion' | 'wa-api' | 'comms';
    const [activeTab, setActiveTab] = useState<TabType>('estado');
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
        actionSectionBg: '#0c3c7c',
        joinSectionBg: '#0C3C7C',
        areasSectionBg: '#0c3c7c',
        footerBg: '#013E7D',
        copyrightBg: '#013871',
        copyrightTextColor: '#FFFFFF',
        buttonBg: '#e0f2fe',
        buttonHoverBg: '#bae6fd',
        buttonTextColor: '#004080',
        buttonTextHoverColor: '#004080',
        eventHeroImages: [] as { url: string; alt?: string }[],
        eventNavMenu: { inicio: true, sobreNosotros: true, proyectos: true, noticias: true, eventos: true, contacto: true } as Record<string, boolean>,
        actionContent: { title: '', text: '', buttonText: '', buttonUrl: '', icon: 'star', iconColor: '#F5A623', titleHighlight: '', titleHighlightColor: '#f6a40a' } as { title: string; text: string; buttonText: string; buttonUrl: string; icon: string; iconColor: string; titleHighlight: string; titleHighlightColor: string },
        statsContent: [
            { icon: 'globe', color: '#004080', value: '+1.2M', text: 'Somos más de 1.2 millones de rotarios en el mundo, dedicados a servir, mejorar y transformar nuestras comunidades.' },
            { icon: 'users', color: '#9333EA', value: '+47M', text: 'Con más de aproximadamente 47 millones de horas de trabajo voluntario cada año. Somos Resiliencia y Continuidad.' },
            { icon: 'dollar', color: '#F2B10D', value: '$291M', text: 'Hemos destinado 291 millones de dólares a iniciativas de servicio en el mundo y proyectos sostenibles.' },
        ] as { icon: string; color: string; value: string; text: string }[],
        joinContent: { title: '', text: '', buttonText: '', buttonUrl: '', icon: 'star', titleHighlight: '', titleHighlightColor: '#f6a40a' } as { title: string; text: string; buttonText: string; buttonUrl: string; icon: string; titleHighlight: string; titleHighlightColor: string },
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
                actionSectionBg: club.colors?.actionBg || settingsMap['action_section_bg'] || '#0c3c7c',
                joinSectionBg: club.colors?.joinBg || settingsMap['join_section_bg'] || '#0C3C7C',
                areasSectionBg: club.colors?.areasBg || settingsMap['areas_section_bg'] || '#0c3c7c',
                footerBg: club.colors?.footerBg || settingsMap['footer_bg'] || '#013E7D',
                copyrightBg: club.colors?.copyrightBg || settingsMap['copyright_bg'] || '#013871',
                copyrightTextColor: club.colors?.copyrightText || settingsMap['copyright_text_color'] || '#FFFFFF',
                buttonBg: club.colors?.buttonBg || settingsMap['button_bg'] || '#e0f2fe',
                buttonHoverBg: club.colors?.buttonHoverBg || settingsMap['button_hover_bg'] || '#bae6fd',
                buttonTextColor: club.colors?.buttonText || settingsMap['button_text_color'] || '#004080',
                buttonTextHoverColor: club.colors?.buttonTextHover || settingsMap['button_text_hover_color'] || club.colors?.buttonText || settingsMap['button_text_color'] || '#004080',
                eventHeroImages: (club as any).eventHeroImages || (() => { try { return JSON.parse(settingsMap['event_hero_images'] || '[]'); } catch { return []; } })(),
                eventNavMenu: (() => {
                    const saved = (club as any).eventNavMenu || (() => { try { return JSON.parse(settingsMap['event_nav_menu'] || '{}'); } catch { return {}; } })();
                    return { inicio: true, sobreNosotros: true, proyectos: true, noticias: true, eventos: true, contacto: true, ...saved };
                })(),
                actionContent: (() => {
                    const saved = (club as any).actionContent || (() => { try { return JSON.parse(settingsMap['action_section_content'] || '{}'); } catch { return {}; } })();
                    return { title: '', text: '', buttonText: '', buttonUrl: '', icon: 'star', iconColor: '#F5A623', titleHighlight: '', titleHighlightColor: '#f6a40a', ...saved };
                })(),
                statsContent: (() => {
                    const saved = ((club as any).statsContent && (club as any).statsContent.length) ? (club as any).statsContent : (() => { try { const v = JSON.parse(settingsMap['stats_content'] || '[]'); return v.length ? v : null; } catch { return null; } })();
                    return saved || [
                        { icon: 'globe', color: '#004080', value: '+1.2M', text: 'Somos más de 1.2 millones de rotarios en el mundo, dedicados a servir, mejorar y transformar nuestras comunidades.' },
                        { icon: 'users', color: '#9333EA', value: '+47M', text: 'Con más de aproximadamente 47 millones de horas de trabajo voluntario cada año. Somos Resiliencia y Continuidad.' },
                        { icon: 'dollar', color: '#F2B10D', value: '$291M', text: 'Hemos destinado 291 millones de dólares a iniciativas de servicio en el mundo y proyectos sostenibles.' },
                    ];
                })(),
                joinContent: (() => {
                    const saved = (club as any).joinContent || (() => { try { return JSON.parse(settingsMap['join_section_content'] || '{}'); } catch { return {}; } })();
                    return { title: '', text: '', buttonText: '', buttonUrl: '', icon: 'star', titleHighlight: '', titleHighlightColor: '#f6a40a', ...saved };
                })(),
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

    // Subida de imágenes del Hero del Evento (acepta varias; se agregan al arreglo).
    const handleEventHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        setUploading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const uploaded: { url: string; alt?: string }[] = [];
            for (const file of files) {
                const uploadData = new FormData();
                uploadData.append('file', file);
                uploadData.append('folder', 'event-hero');
                const res = await fetch(`${API_URL}/media/upload?folder=event-hero&clubId=${club?.id}`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` },
                    body: uploadData
                });
                if (res.ok) {
                    const data = await res.json();
                    uploaded.push({ url: data.url, alt: file.name.replace(/\.[^.]+$/, '') });
                }
            }
            if (uploaded.length) {
                setFormData(prev => ({ ...prev, eventHeroImages: [...(prev.eventHeroImages || []), ...uploaded] }));
                toast.success(`${uploaded.length} imagen(es) agregada(s)`);
            } else {
                throw new Error('No se pudo subir');
            }
        } catch (error: any) {
            toast.error(`Error al subir: ${error.message}`);
        } finally {
            setUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    const removeEventHeroImage = (idx: number) => {
        setFormData(prev => ({ ...prev, eventHeroImages: (prev.eventHeroImages || []).filter((_, i) => i !== idx) }));
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
        ...(isSuperAdmin ? [
            { id: 'wa-api', label: 'WhatsApp API', icon: MessageSquare },
            { id: 'comms', label: 'Comunicaciones', icon: Mail },
            { id: 'avanzado', label: 'Avanzado', icon: SettingsIcon }
        ] : []),
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

                        {/* Color de fondo de la sección "Somos gente de acción" — solo Eventos/Convenciones */}
                        {(isSuperAdmin || club?.type === 'Evento o Convención') && (
                            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-3">
                                    <Palette className="w-5 h-5 text-rotary-blue" /> Color de Sección "Somos gente de acción"
                                </h3>
                                <p className="text-xs text-gray-400 mb-6">
                                    Personaliza el color de fondo del bloque de llamado a la acción de tu portada.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                    <div className="space-y-4">
                                        <label className="text-xs font-bold text-gray-400 uppercase">Color de Fondo</label>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="color"
                                                value={formData.actionSectionBg}
                                                onChange={e => setFormData({...formData, actionSectionBg: e.target.value})}
                                                className="w-12 h-12 rounded-xl cursor-pointer border-none"
                                            />
                                            <input
                                                type="text"
                                                value={formData.actionSectionBg}
                                                onChange={e => setFormData({...formData, actionSectionBg: e.target.value})}
                                                className="flex-1 px-4 py-2 bg-gray-50 rounded-lg text-sm font-mono font-bold"
                                            />
                                        </div>
                                    </div>
                                    <div
                                        className="relative overflow-hidden rounded-2xl p-6 text-center"
                                        style={{ backgroundColor: formData.actionSectionBg }}
                                    >
                                        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "url('/geo-darkblue.png')", backgroundPosition: '50% 0', backgroundRepeat: 'repeat', backgroundSize: '71px 85px', mixBlendMode: 'overlay', opacity: 0.85 }} />
                                        <p className="relative text-white text-lg font-light mb-1">Somos gente de acción</p>
                                        <p className="relative text-white/80 text-xs">Vista previa (igual que en el sitio)</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Color de fondo de la sección "Únete a Rotary" — solo Eventos/Convenciones */}
                        {(isSuperAdmin || club?.type === 'Evento o Convención') && (
                            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-3">
                                    <Palette className="w-5 h-5 text-rotary-blue" /> Color de Sección "Únete a Rotary"
                                </h3>
                                <p className="text-xs text-gray-400 mb-6">
                                    Personaliza el color de fondo del bloque "Únete a Rotary" (con la foto y el botón Involúcrate).
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                    <div className="space-y-4">
                                        <label className="text-xs font-bold text-gray-400 uppercase">Color de Fondo</label>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="color"
                                                value={formData.joinSectionBg}
                                                onChange={e => setFormData({...formData, joinSectionBg: e.target.value})}
                                                className="w-12 h-12 rounded-xl cursor-pointer border-none"
                                            />
                                            <input
                                                type="text"
                                                value={formData.joinSectionBg}
                                                onChange={e => setFormData({...formData, joinSectionBg: e.target.value})}
                                                className="flex-1 px-4 py-2 bg-gray-50 rounded-lg text-sm font-mono font-bold"
                                            />
                                        </div>
                                    </div>
                                    <div
                                        className="relative overflow-hidden rounded-2xl p-6 text-center"
                                        style={{ backgroundColor: formData.joinSectionBg }}
                                    >
                                        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "url('/geo-darkblue.png')", backgroundPosition: '50% 0', backgroundRepeat: 'repeat', backgroundSize: '71px 85px', mixBlendMode: 'overlay', opacity: 0.85 }} />
                                        <p className="relative text-white text-lg font-light mb-1">Únete a Rotary</p>
                                        <p className="relative text-white/80 text-xs">Vista previa (igual que en el sitio)</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Color de fondo de la sección "Áreas de Interés" — solo Eventos/Convenciones */}
                        {(isSuperAdmin || club?.type === 'Evento o Convención') && (
                            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-3">
                                    <Palette className="w-5 h-5 text-rotary-blue" /> Color de Sección "Áreas de Interés"
                                </h3>
                                <p className="text-xs text-gray-400 mb-6">
                                    Color de fondo del bloque de la portada con el nombre del sitio y los círculos de las áreas prioritarias. Es independiente de las demás secciones.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                    <div className="space-y-4">
                                        <label className="text-xs font-bold text-gray-400 uppercase">Color de Fondo</label>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="color"
                                                value={formData.areasSectionBg}
                                                onChange={e => setFormData({...formData, areasSectionBg: e.target.value})}
                                                className="w-12 h-12 rounded-xl cursor-pointer border-none"
                                            />
                                            <input
                                                type="text"
                                                value={formData.areasSectionBg}
                                                onChange={e => setFormData({...formData, areasSectionBg: e.target.value})}
                                                className="flex-1 px-4 py-2 bg-gray-50 rounded-lg text-sm font-mono font-bold"
                                            />
                                        </div>
                                    </div>
                                    <div
                                        className="relative overflow-hidden rounded-2xl p-6 text-center"
                                        style={{ backgroundColor: formData.areasSectionBg }}
                                    >
                                        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "url('/geo-darkblue.png')", backgroundPosition: '50% 0', backgroundRepeat: 'repeat', backgroundSize: '71px 85px', mixBlendMode: 'overlay', opacity: 0.85 }} />
                                        <p className="relative text-white text-lg font-light mb-1">Áreas de Interés</p>
                                        <p className="relative text-white/80 text-xs">Vista previa (igual que en el sitio)</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Colores del Footer (pie de página) y barra de copyright */}
                        {(isSuperAdmin || club?.type === 'Evento o Convención') && (
                            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-3">
                                    <Palette className="w-5 h-5 text-rotary-blue" /> Colores del Footer
                                </h3>
                                <p className="text-xs text-gray-400 mb-6">
                                    Color de fondo del pie de página y de la barra inferior de copyright.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                    <div className="space-y-5">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-400 uppercase">Fondo del Footer</label>
                                            <div className="flex items-center gap-4">
                                                <input type="color" value={formData.footerBg} onChange={e => setFormData({...formData, footerBg: e.target.value})} className="w-12 h-12 rounded-xl cursor-pointer border-none" />
                                                <input type="text" value={formData.footerBg} onChange={e => setFormData({...formData, footerBg: e.target.value})} className="flex-1 px-4 py-2 bg-gray-50 rounded-lg text-sm font-mono font-bold" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-400 uppercase">Fondo del Copyright</label>
                                            <div className="flex items-center gap-4">
                                                <input type="color" value={formData.copyrightBg} onChange={e => setFormData({...formData, copyrightBg: e.target.value})} className="w-12 h-12 rounded-xl cursor-pointer border-none" />
                                                <input type="text" value={formData.copyrightBg} onChange={e => setFormData({...formData, copyrightBg: e.target.value})} className="flex-1 px-4 py-2 bg-gray-50 rounded-lg text-sm font-mono font-bold" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-400 uppercase">Color del Texto del Copyright</label>
                                            <div className="flex items-center gap-4">
                                                <input type="color" value={formData.copyrightTextColor} onChange={e => setFormData({...formData, copyrightTextColor: e.target.value})} className="w-12 h-12 rounded-xl cursor-pointer border-none" />
                                                <input type="text" value={formData.copyrightTextColor} onChange={e => setFormData({...formData, copyrightTextColor: e.target.value})} className="flex-1 px-4 py-2 bg-gray-50 rounded-lg text-sm font-mono font-bold" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="rounded-2xl overflow-hidden border border-gray-100">
                                        <div className="relative overflow-hidden p-6 text-center" style={{ backgroundColor: formData.footerBg }}>
                                            <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "url('/geo-darkblue.png')", backgroundPosition: '50% 0', backgroundRepeat: 'repeat', backgroundSize: '71px 85px', mixBlendMode: 'overlay', opacity: 0.85 }} />
                                            <p className="relative text-white text-sm font-bold mb-1">El Club · Realiza una Acción · Newsletter</p>
                                            <p className="relative text-white/70 text-xs">Pie de página</p>
                                        </div>
                                        <div className="py-3 text-center" style={{ backgroundColor: formData.copyrightBg }}>
                                            <p className="text-[11px]" style={{ color: formData.copyrightTextColor }}>© {new Date().getFullYear()} · Todos los derechos reservados</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Colores de los botones del inicio — solo Eventos/Convenciones */}
                        {(isSuperAdmin || club?.type === 'Evento o Convención') && (
                            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-3">
                                    <Palette className="w-5 h-5 text-rotary-blue" /> Colores de los Botones del Inicio
                                </h3>
                                <p className="text-xs text-gray-400 mb-6">
                                    Botones de llamado a la acción de la portada (Toma Acción, Involúcrate, Explora noticias, etc.). Configura el fondo, el fondo al pasar el mouse (hover) y el color del texto.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                    <div className="space-y-5">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-400 uppercase">Fondo del Botón</label>
                                            <div className="flex items-center gap-4">
                                                <input type="color" value={formData.buttonBg} onChange={e => setFormData({...formData, buttonBg: e.target.value})} className="w-12 h-12 rounded-xl cursor-pointer border-none" />
                                                <input type="text" value={formData.buttonBg} onChange={e => setFormData({...formData, buttonBg: e.target.value})} className="flex-1 px-4 py-2 bg-gray-50 rounded-lg text-sm font-mono font-bold" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-400 uppercase">Fondo al pasar el mouse (Hover)</label>
                                            <div className="flex items-center gap-4">
                                                <input type="color" value={formData.buttonHoverBg} onChange={e => setFormData({...formData, buttonHoverBg: e.target.value})} className="w-12 h-12 rounded-xl cursor-pointer border-none" />
                                                <input type="text" value={formData.buttonHoverBg} onChange={e => setFormData({...formData, buttonHoverBg: e.target.value})} className="flex-1 px-4 py-2 bg-gray-50 rounded-lg text-sm font-mono font-bold" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-400 uppercase">Color del Texto</label>
                                            <div className="flex items-center gap-4">
                                                <input type="color" value={formData.buttonTextColor} onChange={e => setFormData({...formData, buttonTextColor: e.target.value})} className="w-12 h-12 rounded-xl cursor-pointer border-none" />
                                                <input type="text" value={formData.buttonTextColor} onChange={e => setFormData({...formData, buttonTextColor: e.target.value})} className="flex-1 px-4 py-2 bg-gray-50 rounded-lg text-sm font-mono font-bold" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-gray-400 uppercase">Color del Texto al pasar el mouse (Hover)</label>
                                            <div className="flex items-center gap-4">
                                                <input type="color" value={formData.buttonTextHoverColor} onChange={e => setFormData({...formData, buttonTextHoverColor: e.target.value})} className="w-12 h-12 rounded-xl cursor-pointer border-none" />
                                                <input type="text" value={formData.buttonTextHoverColor} onChange={e => setFormData({...formData, buttonTextHoverColor: e.target.value})} className="flex-1 px-4 py-2 bg-gray-50 rounded-lg text-sm font-mono font-bold" />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="rounded-2xl p-8 flex flex-col items-center justify-center gap-2 bg-gray-50 border border-gray-100">
                                        <button
                                            type="button"
                                            className="cta-btn inline-flex items-center gap-2 font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
                                            style={{ ['--btn-bg' as string]: formData.buttonBg, ['--btn-hover' as string]: formData.buttonHoverBg, ['--btn-text' as string]: formData.buttonTextColor, ['--btn-text-hover' as string]: formData.buttonTextHoverColor } as React.CSSProperties}
                                        >
                                            ★ Toma Acción con Nosotros
                                        </button>
                                        <p className="text-[11px] text-gray-400">Pasa el mouse por el botón para ver el hover.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Hero del Evento — solo Eventos/Convenciones */}
                        {(isSuperAdmin || club?.type === 'Evento o Convención') && (
                            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-3">
                                    <Palette className="w-5 h-5 text-rotary-blue" /> Hero del Evento (Portada)
                                </h3>
                                <p className="text-xs text-gray-400 mb-6">
                                    Portada a pantalla completa, distinta a la de los sitios normales. Sube <strong>una sola imagen</strong> (queda estática) o <strong>varias</strong> (rotan en carrusel automático). Si no subes ninguna, se usa el hero por defecto. Tamaño ideal: 1920×750px.
                                </p>

                                <div className="flex flex-wrap gap-4">
                                    {(formData.eventHeroImages || []).map((img, idx) => (
                                        <div key={idx} className="relative w-40 h-24 rounded-xl overflow-hidden border border-gray-200 group">
                                            <img src={img.url} alt={img.alt || ''} className="w-full h-full object-cover" />
                                            <button
                                                type="button"
                                                onClick={() => removeEventHeroImage(idx)}
                                                className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                                title="Quitar imagen"
                                            >
                                                ×
                                            </button>
                                            <span className="absolute bottom-1 left-1 bg-black/50 text-white text-[10px] px-1.5 py-0.5 rounded">{idx + 1}</span>
                                        </div>
                                    ))}
                                    <label className={`w-40 h-24 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-rotary-blue hover:bg-sky-50 transition-all text-gray-400 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                                        <span className="text-2xl leading-none">+</span>
                                        <span className="text-[11px] font-bold mt-1">{uploading ? 'Subiendo…' : 'Agregar imagen(es)'}</span>
                                        <input type="file" className="hidden" accept="image/*" multiple onChange={handleEventHeroUpload} />
                                    </label>
                                </div>
                                {(formData.eventHeroImages || []).length > 0 && (
                                    <p className="text-[11px] text-gray-400 mt-3">
                                        {formData.eventHeroImages.length === 1 ? 'Imagen única (hero estático).' : `${formData.eventHeroImages.length} imágenes (carrusel automático).`}
                                    </p>
                                )}
                            </div>
                        )}

                        {/* Menú principal configurable — solo Eventos/Convenciones */}
                        {(isSuperAdmin || club?.type === 'Evento o Convención') && (
                            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-3">
                                    <Palette className="w-5 h-5 text-rotary-blue" /> Menú Principal
                                </h3>
                                <p className="text-xs text-gray-400 mb-6">
                                    Activa o desactiva las secciones que se muestran en el menú de navegación principal del sitio.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {[
                                        { key: 'inicio', label: 'Inicio' },
                                        { key: 'sobreNosotros', label: 'Sobre Nosotros' },
                                        { key: 'proyectos', label: 'Proyectos' },
                                        { key: 'noticias', label: 'Noticias' },
                                        { key: 'eventos', label: 'Eventos' },
                                        { key: 'contacto', label: 'Contacto' },
                                    ].map(item => (
                                        <label key={item.key} className="flex items-center gap-3 cursor-pointer p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 text-rotary-blue rounded border-gray-300 focus:ring-rotary-blue"
                                                checked={formData.eventNavMenu?.[item.key] !== false}
                                                onChange={e => setFormData({ ...formData, eventNavMenu: { ...formData.eventNavMenu, [item.key]: e.target.checked } })}
                                            />
                                            <span className="text-[13px] font-bold text-gray-700">{item.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Contenido de la sección "Somos gente de acción" — solo Eventos/Convenciones */}
                        {(isSuperAdmin || club?.type === 'Evento o Convención') && (
                            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-3">
                                    <Palette className="w-5 h-5 text-rotary-blue" /> Sección "Somos gente de acción" (Contenido)
                                </h3>
                                <p className="text-xs text-gray-400 mb-6">
                                    Personaliza el título, el texto y el botón de este bloque de la portada. Si dejas un campo vacío, se usa el texto por defecto.
                                </p>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 uppercase">Título</label>
                                        <textarea rows={2} value={formData.actionContent.title} onChange={e => setFormData({ ...formData, actionContent: { ...formData.actionContent, title: e.target.value } })} placeholder="Somos gente de acción" className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none resize-y" />
                                        <p className="text-[11px] text-gray-400 mt-1">El título se muestra en negrilla. Presiona <strong>Enter</strong> donde quieras un salto de línea.</p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                                        <div>
                                            <label className="text-xs font-bold text-gray-400 uppercase">Palabras a resaltar en el título</label>
                                            <input type="text" value={formData.actionContent.titleHighlight} onChange={e => setFormData({ ...formData, actionContent: { ...formData.actionContent, titleHighlight: e.target.value } })} placeholder="Ej: END POLIO NOW" className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none" />
                                            <p className="text-[11px] text-gray-400 mt-1">Esa parte del título se mostrará en el color elegido.</p>
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-400 uppercase">Color del resaltado</label>
                                            <div className="flex items-center gap-4 mt-1">
                                                <input type="color" value={formData.actionContent.titleHighlightColor} onChange={e => setFormData({ ...formData, actionContent: { ...formData.actionContent, titleHighlightColor: e.target.value } })} className="w-12 h-12 rounded-xl cursor-pointer border-none" />
                                                <input type="text" value={formData.actionContent.titleHighlightColor} onChange={e => setFormData({ ...formData, actionContent: { ...formData.actionContent, titleHighlightColor: e.target.value } })} className="flex-1 px-4 py-2 bg-gray-50 rounded-lg text-sm font-mono font-bold" />
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 uppercase">Texto</label>
                                        <textarea rows={3} value={formData.actionContent.text} onChange={e => setFormData({ ...formData, actionContent: { ...formData.actionContent, text: e.target.value } })} placeholder="Descripción del bloque…" className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none resize-y" />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-gray-400 uppercase">Texto del Botón</label>
                                            <input type="text" value={formData.actionContent.buttonText} onChange={e => setFormData({ ...formData, actionContent: { ...formData.actionContent, buttonText: e.target.value } })} placeholder="Toma Acción con Nosotros" className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-400 uppercase">Enlace del Botón</label>
                                            <input type="text" value={formData.actionContent.buttonUrl} onChange={e => setFormData({ ...formData, actionContent: { ...formData.actionContent, buttonUrl: e.target.value } })} placeholder="/involucrate o https://…" className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 uppercase">Icono del Botón (Emoji)</label>
                                        <select value={formData.actionContent.icon} onChange={e => setFormData({ ...formData, actionContent: { ...formData.actionContent, icon: e.target.value } })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none bg-white">
                                            <option value="star">⭐ Estrella</option>
                                            <option value="heart">❤️ Corazón</option>
                                            <option value="handshake">🤝 Apretón de manos</option>
                                            <option value="send">✈️ Enviar</option>
                                            <option value="sparkles">✨ Destellos</option>
                                            <option value="megaphone">📣 Megáfono</option>
                                            <option value="flag">🚩 Bandera</option>
                                            <option value="gift">🎁 Regalo</option>
                                            <option value="users">👥 Personas</option>
                                            <option value="calendar">📅 Calendario</option>
                                            <option value="award">🏅 Medalla</option>
                                            <option value="trophy">🏆 Trofeo</option>
                                            <option value="rocket">🚀 Cohete</option>
                                        </select>
                                        <p className="text-[11px] text-gray-400 mt-1">El emoji se muestra con sus colores originales en el botón.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Sección de Estadísticas (3 cajas) — solo Eventos/Convenciones */}
                        {(isSuperAdmin || club?.type === 'Evento o Convención') && (
                            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-3">
                                    <Palette className="w-5 h-5 text-rotary-blue" /> Sección de Estadísticas (3 Cajas)
                                </h3>
                                <p className="text-xs text-gray-400 mb-6">
                                    Personaliza el icono, color, número/valor y texto de cada una de las tres cajas de estadísticas de la portada.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {formData.statsContent.map((box, i) => (
                                        <div key={i} className="border border-gray-100 rounded-2xl p-4 space-y-3 bg-gray-50/50">
                                            <p className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Caja {i + 1}</p>
                                            <div className="flex items-center gap-2">
                                                <select value={box.icon} onChange={e => { const s = [...formData.statsContent]; s[i] = { ...s[i], icon: e.target.value }; setFormData({ ...formData, statsContent: s }); }} className="flex-1 px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue bg-white text-sm">
                                                    <option value="globe">🌐 Globo</option>
                                                    <option value="users">👥 Personas</option>
                                                    <option value="dollar">💲 Dólar</option>
                                                    <option value="heart">❤️ Corazón</option>
                                                    <option value="handheart">🫶 Mano/Corazón</option>
                                                    <option value="award">🏅 Medalla</option>
                                                    <option value="trophy">🏆 Trofeo</option>
                                                    <option value="calendar">📅 Calendario</option>
                                                    <option value="star">⭐ Estrella</option>
                                                    <option value="flag">🚩 Bandera</option>
                                                    <option value="gift">🎁 Regalo</option>
                                                    <option value="sparkles">✨ Destellos</option>
                                                    <option value="rocket">🚀 Cohete</option>
                                                    <option value="megaphone">📣 Megáfono</option>
                                                </select>
                                                <input type="color" value={box.color} onChange={e => { const s = [...formData.statsContent]; s[i] = { ...s[i], color: e.target.value }; setFormData({ ...formData, statsContent: s }); }} className="w-10 h-10 rounded-lg cursor-pointer border-none flex-shrink-0" title="Color del icono y el número" />
                                            </div>
                                            <input type="text" value={box.value} onChange={e => { const s = [...formData.statsContent]; s[i] = { ...s[i], value: e.target.value }; setFormData({ ...formData, statsContent: s }); }} placeholder="Ej: +1.2M" className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue text-sm font-bold" />
                                            <textarea rows={4} value={box.text} onChange={e => { const s = [...formData.statsContent]; s[i] = { ...s[i], text: e.target.value }; setFormData({ ...formData, statsContent: s }); }} placeholder="Texto de la caja…" className="w-full px-3 py-2 border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-rotary-blue text-sm resize-y" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Contenido de la sección "Únete a Rotary" — solo Eventos/Convenciones */}
                        {(isSuperAdmin || club?.type === 'Evento o Convención') && (
                            <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                                <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-3">
                                    <Palette className="w-5 h-5 text-rotary-blue" /> Sección "Únete a Rotary" (Contenido)
                                </h3>
                                <p className="text-xs text-gray-400 mb-6">
                                    Personaliza el título, el texto y el botón del bloque "Únete a Rotary". Si dejas un campo vacío, se usa el texto por defecto. (La imagen se cambia en "Imágenes del Sitio".)
                                </p>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 uppercase">Título</label>
                                        <textarea rows={2} value={formData.joinContent.title} onChange={e => setFormData({ ...formData, joinContent: { ...formData.joinContent, title: e.target.value } })} placeholder="Únete a Rotary y construyamos juntos…" className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none resize-y" />
                                        <p className="text-[11px] text-gray-400 mt-1">Presiona <strong>Enter</strong> donde quieras un salto de línea.</p>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                                        <div>
                                            <label className="text-xs font-bold text-gray-400 uppercase">Palabras a resaltar en el título</label>
                                            <input type="text" value={formData.joinContent.titleHighlight} onChange={e => setFormData({ ...formData, joinContent: { ...formData.joinContent, titleHighlight: e.target.value } })} placeholder="Opcional" className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-400 uppercase">Color del resaltado</label>
                                            <div className="flex items-center gap-4 mt-1">
                                                <input type="color" value={formData.joinContent.titleHighlightColor} onChange={e => setFormData({ ...formData, joinContent: { ...formData.joinContent, titleHighlightColor: e.target.value } })} className="w-12 h-12 rounded-xl cursor-pointer border-none" />
                                                <input type="text" value={formData.joinContent.titleHighlightColor} onChange={e => setFormData({ ...formData, joinContent: { ...formData.joinContent, titleHighlightColor: e.target.value } })} className="flex-1 px-4 py-2 bg-gray-50 rounded-lg text-sm font-mono font-bold" />
                                            </div>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 uppercase">Texto</label>
                                        <textarea rows={3} value={formData.joinContent.text} onChange={e => setFormData({ ...formData, joinContent: { ...formData.joinContent, text: e.target.value } })} placeholder="Descripción del bloque…" className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none resize-y" />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-bold text-gray-400 uppercase">Texto del Botón</label>
                                            <input type="text" value={formData.joinContent.buttonText} onChange={e => setFormData({ ...formData, joinContent: { ...formData.joinContent, buttonText: e.target.value } })} placeholder="Involúcrate en Rotary" className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none" />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-gray-400 uppercase">Enlace del Botón</label>
                                            <input type="text" value={formData.joinContent.buttonUrl} onChange={e => setFormData({ ...formData, joinContent: { ...formData.joinContent, buttonUrl: e.target.value } })} placeholder="/involucrate o https://…" className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold text-gray-400 uppercase">Icono del Botón (Emoji)</label>
                                        <select value={formData.joinContent.icon} onChange={e => setFormData({ ...formData, joinContent: { ...formData.joinContent, icon: e.target.value } })} className="w-full mt-1 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-rotary-blue outline-none bg-white">
                                            <option value="star">⭐ Estrella</option>
                                            <option value="heart">❤️ Corazón</option>
                                            <option value="handshake">🤝 Apretón de manos</option>
                                            <option value="send">✈️ Enviar</option>
                                            <option value="sparkles">✨ Destellos</option>
                                            <option value="megaphone">📣 Megáfono</option>
                                            <option value="flag">🚩 Bandera</option>
                                            <option value="gift">🎁 Regalo</option>
                                            <option value="users">👥 Personas</option>
                                            <option value="calendar">📅 Calendario</option>
                                            <option value="award">🏅 Medalla</option>
                                            <option value="trophy">🏆 Trofeo</option>
                                            <option value="rocket">🚀 Cohete</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'wa-api' && isSuperAdmin && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <WhatsAppConfig />
                    </div>
                )}

                {activeTab === 'comms' && isSuperAdmin && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <SystemCommunicationsConfig />
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
