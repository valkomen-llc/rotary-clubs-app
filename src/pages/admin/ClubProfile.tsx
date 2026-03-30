import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { Link } from 'react-router-dom';
import {
    Building2, Save, Upload, MapPin, Globe, Mail, Phone,
    Facebook, Instagram, Twitter, Youtube, Info, Trash2, Dna
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth';
import ClubArchetypeCard from '../../components/admin/ClubArchetypeCard';

const ClubProfile: React.FC = () => {
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const [clubType, setClubType] = useState('');
    const [formData, setFormData] = useState<{
        name: string;
        description: string;
        city: string;
        country: string;
        district: string;
        logo: string;
        domain: string;
        email: string;
        phone: string;
        address: string;
        facebook: string;
        instagram: string;
        twitter: string;
        youtube: string;
        storeActive: boolean;
        logoHeaderSize: number;
        archetype: any;
    }>({
        name: '',
        description: '',
        city: '',
        country: '',
        district: '',
        logo: '',
        domain: '', // Personal custom domain managed by the club
        // Settings/Metadata
        email: '',
        phone: '',
        address: '',
        facebook: '',
        instagram: '',
        twitter: '',
        youtube: '',
        storeActive: true,
        logoHeaderSize: 200,
        archetype: null,
    });

    useEffect(() => {
        if (user?.role === 'administrator') {
            // Super admins can't edit "Mi Club" because they aren't tied to one.
            setIsLoading(false);
        } else if (user?.clubId || (user as any)?.club?.id) {
            fetchClubInfo();
        } else {
            setIsLoading(false);
        }
    }, [user]);

    const fetchClubInfo = async () => {
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/clubs/${user?.clubId || (user as any)?.club?.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                setClubType(data.type || 'club');

                // Map settings array to form fields
                const settingsMap: any = {};
                if (Array.isArray(data.settings)) {
                    data.settings.forEach((s: any) => {
                        settingsMap[s.key] = s.value;
                    });
                } else if (data.settings && typeof data.settings === 'object') {
                    Object.assign(settingsMap, data.settings);
                }

                setFormData({
                    name: data.name || '',
                    description: data.description || '',
                    city: data.city || '',
                    country: data.country || '',
                    district: data.district || '',
                    logo: data.logo || '',
                    domain: data.domain || '',
                    email: settingsMap['contact_email'] || '',
                    phone: settingsMap['contact_phone'] || '',
                    address: settingsMap['contact_address'] || '',
                    facebook: settingsMap['social_facebook'] || '',
                    instagram: settingsMap['social_instagram'] || '',
                    twitter: settingsMap['social_twitter'] || '',
                    youtube: settingsMap['social_youtube'] || '',
                    storeActive: settingsMap['store_active'] !== 'false', // Default true
                    logoHeaderSize: parseInt(settingsMap['logo_header_size']) || 150,
                    archetype: data.archetype || null,
                });
            }
        } catch (error) {
            toast.error('Error al cargar la información del club');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formDataUpload = new FormData();
        formDataUpload.append('file', file);

        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/media/upload-logo`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formDataUpload
            });

            if (response.ok) {
                const data = await response.json();
                setFormData(prev => ({ ...prev, logo: data.url }));
                toast.success('Logo cargado correctamente');
            }
        } catch (error) {
            toast.error('Error al subir el logo');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);

        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/clubs/${user?.clubId || (user as any)?.club?.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                toast.success('Perfil del club actualizado con éxito');
                fetchClubInfo();
            } else {
                toast.error('Error al actualizar el perfil');
            }
        } catch (error) {
            toast.error('Error de conexión');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-gray-100">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rotary-blue"></div>
                    <span className="ml-3 text-gray-500 italic">Cargando perfil...</span>
                </div>
            </AdminLayout>
        );
    }

    if (!(user?.clubId || (user as any)?.club?.id) && user?.role === 'administrator') {
        return (
            <AdminLayout>
                <div className="bg-white p-12 rounded-3xl border border-gray-100 shadow-sm text-center">
                    <Building2 className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-gray-800 mb-2">Acceso de Súper Administrador</h2>
                    <p className="text-gray-500 max-w-sm mx-auto">
                        Como Súper Administrador global, no tienes un club específico asignado. Para editar la configuración de un club, ve a la sección de <strong>Clubes</strong>.
                    </p>
                    <Link to="/admin/clubes" className="inline-block mt-6 text-rotary-blue font-bold hover:underline">
                        Ir a Gestión de Clubes →
                    </Link>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="mb-8 flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">
                        {clubType === 'district' ? 'Mi Distrito' : 'Mi Club'}
                    </h1>
                    <p className="text-gray-500 text-sm">
                        Personaliza la identidad y contacto de tu {clubType === 'district' ? 'distrito' : 'club'} en la plataforma.
                    </p>
                </div>
                <button
                    onClick={handleSubmit}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-rotary-blue text-white px-6 py-2.5 rounded-xl font-bold hover:bg-sky-800 transition-all shadow-lg shadow-rotary-blue/20 disabled:opacity-50"
                >
                    <Save className="w-5 h-5" /> {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8 pb-20">
                {/* Sección 1: Identidad Visual */}
                <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-sky-50 text-rotary-blue rounded-lg">
                            <Building2 className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-800">
                            Identidad del {clubType === 'district' ? 'Distrito' : 'Club'}
                        </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Logo Upload */}
                        <div className="space-y-4">
                            <label className="text-sm font-bold text-gray-700 block text-center">
                                Logo del {clubType === 'district' ? 'Distrito' : 'Club'} (Header)
                            </label>
                            <div className="relative group mx-auto w-40 h-40">
                                <div className="w-40 h-40 rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden transition-all group-hover:border-rotary-blue/40">
                                    {formData.logo ? (
                                        <img src={formData.logo} alt="Logo" className="w-full h-full object-contain p-4" />
                                    ) : (
                                        <Building2 className="w-12 h-12 text-gray-300" />
                                    )}
                                </div>
                                <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-2xl">
                                    <Upload className="text-white w-8 h-8" />
                                    <input type="file" className="hidden" onChange={handleLogoUpload} accept="image/*" />
                                </label>
                                {formData.logo && (
                                    <button
                                        type="button"
                                        onClick={() => setFormData({ ...formData, logo: '' })}
                                        className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600 transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                            <p className="text-[10px] text-gray-400 text-center font-medium">Recomendado: PNG fondo transparente, min 400x400px.</p>

                            {/* Logo Size Slider — Foundation type only */}
                            {clubType === 'foundation' && (
                                <div className="mt-4 pt-4 border-t border-gray-100">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-bold text-gray-500 uppercase">Tamaño del Logo</label>
                                        <span className="text-xs font-mono font-bold text-[#0c3c7c] bg-blue-50 px-2 py-0.5 rounded-full">
                                            {formData.logoHeaderSize}px
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min={60}
                                        max={450}
                                        step={5}
                                        value={formData.logoHeaderSize}
                                        onChange={(e) => setFormData(prev => ({ ...prev, logoHeaderSize: Number(e.target.value) }))}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#0c3c7c]"
                                    />
                                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                                        <span>60px</span>
                                        <span>300px</span>
                                    </div>
                                    {formData.logo && (
                                        <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100 flex items-center gap-3">
                                            <span className="text-xs text-gray-400 flex-shrink-0">Vista previa:</span>
                                            <img
                                                src={formData.logo}
                                                alt="Logo preview"
                                                style={{ width: `${formData.logoHeaderSize}px`, maxWidth: '100%' }}
                                                className="h-auto object-contain"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* General Info */}
                        <div className="md:col-span-2 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                                        Nombre del {clubType === 'district' ? 'Distrito' : 'Club'}
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all font-medium text-gray-800"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Distrito</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all font-medium text-gray-800"
                                        value={formData.district}
                                        onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                                        placeholder="Ej: 4281"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Descripción Breve</label>
                                <textarea
                                    rows={3}
                                    className="w-full px-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all font-medium text-gray-800 resize-none"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Describe qué hace especial a tu club..."
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Ciudad</label>
                                    <div className="relative">
                                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                        <input
                                            type="text"
                                            className="w-full pl-10 pr-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all font-medium text-gray-800"
                                            value={formData.city}
                                            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">País</label>
                                    <div className="relative">
                                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                        <input
                                            type="text"
                                            className="w-full pl-10 pr-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all font-medium text-gray-800"
                                            value={formData.country}
                                            onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sección 2: Contacto y Redes */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Datos de Contacto */}
                    <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-green-50 text-green-600 rounded-lg">
                                <Mail className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-bold text-gray-800">Contacto Oficial</h2>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Email de Contacto</label>
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                    <input
                                        type="email"
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all font-medium text-gray-800"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Teléfono / WhatsApp</label>
                                <div className="relative">
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                    <input
                                        type="text"
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all font-medium text-gray-800"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Dirección de Sede (opcional)</label>
                                <div className="relative">
                                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                    <input
                                        type="text"
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all font-medium text-gray-800"
                                        value={formData.address}
                                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Redes Sociales */}
                    <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                <Globe className="w-5 h-5" />
                            </div>
                            <h2 className="text-lg font-bold text-gray-800">Redes Sociales</h2>
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 flex-shrink-0 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400">
                                    <Facebook className="w-5 h-5" />
                                </div>
                                <input
                                    type="text" placeholder="URL de Facebook"
                                    className="flex-1 px-4 py-2.5 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all text-sm font-medium"
                                    value={formData.facebook}
                                    onChange={(e) => setFormData({ ...formData, facebook: e.target.value })}
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 flex-shrink-0 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400">
                                    <Instagram className="w-5 h-5" />
                                </div>
                                <input
                                    type="text" placeholder="URL de Instagram"
                                    className="flex-1 px-4 py-2.5 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all text-sm font-medium"
                                    value={formData.instagram}
                                    onChange={(e) => setFormData({ ...formData, instagram: e.target.value })}
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 flex-shrink-0 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400">
                                    <Twitter className="w-5 h-5" />
                                </div>
                                <input
                                    type="text" placeholder="URL de X (Twitter)"
                                    className="flex-1 px-4 py-2.5 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all text-sm font-medium"
                                    value={formData.twitter}
                                    onChange={(e) => setFormData({ ...formData, twitter: e.target.value })}
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 flex-shrink-0 bg-gray-50 rounded-lg flex items-center justify-center text-gray-400">
                                    <Youtube className="w-5 h-5" />
                                </div>
                                <input
                                    type="text" placeholder="URL de YouTube"
                                    className="flex-1 px-4 py-2.5 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all text-sm font-medium"
                                    value={formData.youtube}
                                    onChange={(e) => setFormData({ ...formData, youtube: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sección: Dominio Personalizado e Instrucciones DNS */}
                <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                            <Globe className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-800">Dominio Personalizado</h2>
                    </div>

                    <div className="space-y-4 max-w-2xl">
                        <p className="text-sm text-gray-600">
                            ¿Tienes tu propio dominio (ej: <strong>rotarybogota.org</strong>)? Escríbelo aquí para que tu plataforma sea accesible desde esa dirección web.
                        </p>
                        <div className="space-y-1">
                            <div className="relative">
                                <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                                <input
                                    type="text"
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border-transparent focus:bg-white focus:border-rotary-blue/20 rounded-xl outline-none transition-all font-medium text-gray-800"
                                    value={formData.domain}
                                    onChange={(e) => setFormData({ ...formData, domain: e.target.value.toLowerCase().replace(/https?:\/\//g, '').replace(/^www\./, '') })}
                                    placeholder="ej: tu-club.org"
                                />
                            </div>
                        </div>

                        {formData.domain && (
                            <div className="mt-6 bg-emerald-50 border border-emerald-100 p-6 rounded-2xl">
                                <h3 className="text-emerald-800 font-bold mb-2 flex items-center gap-2">
                                    <Info className="w-5 h-5" /> Instrucciones Obligatorias (Paso Final)
                                </h3>
                                <p className="text-emerald-700 text-sm mb-4">
                                    Nuestro sistema matriculará tu dominio automáticamente. Sin embargo, para que el internet sepa que <strong className="font-bold">{formData.domain}</strong> dirige a esta plataforma, <strong>tienes que entrar a donde compraste tu dominio</strong> (GoDaddy, Hostinger, Namecheap, etc.) y configurar los DNS apuntando a nuestro servidor:
                                </p>
                                <div className="bg-white p-4 rounded-xl border border-emerald-100 flex flex-col gap-2">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500 font-semibold">Tipo de Registro:</span>
                                        <span className="font-mono text-gray-800 font-bold bg-gray-100 px-2 py-1 rounded">A</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500 font-semibold">Nombre / Host:</span>
                                        <span className="font-mono text-gray-800 font-bold bg-gray-100 px-2 py-1 rounded">@</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-500 font-semibold">Valor / Apunta a:</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-rotary-blue font-bold bg-blue-50 px-2 py-1 rounded">76.76.21.21</span>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-xs text-emerald-600 mt-4 italic font-medium">Nota: Los cambios de DNS suelen tardar algunas horas en propagarse por el mundo.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Configuración de Plataforma */}
                <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                            <Building2 className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-bold text-gray-800">Configuraciones Globales</h2>
                    </div>

                    <div className="space-y-4 max-w-md">
                        <label className="flex items-center gap-3 cursor-pointer p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={formData.storeActive}
                                    onChange={(e) => setFormData({ ...formData, storeActive: e.target.checked })}
                                />
                                <div className={`block w-10 h-6 rounded-full transition-colors ${formData.storeActive ? 'bg-rotary-blue' : 'bg-gray-300'}`}></div>
                                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${formData.storeActive ? 'transform translate-x-4' : ''}`}></div>
                            </div>
                            <div className="flex flex-col">
                                <span className="font-bold text-gray-800 text-sm">Activar Tienda Pública y Aportes</span>
                                <span className="text-xs text-gray-500">Muestra el menú Tienda en el inicio si tienes productos.</span>
                            </div>
                        </label>
                    </div>
                </div>

                <div className="bg-amber-50 rounded-2xl p-6 border border-amber-100 flex gap-4">
                    <div className="p-2 bg-amber-100 text-amber-600 rounded-full h-fit">
                        <Info className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-amber-800 font-bold text-sm">Información Institucional</h4>
                        <p className="text-amber-700/80 text-xs mt-1 leading-relaxed">
                            Los logos del footer y la estética base de la plataforma son institucionales y se mantienen por defecto para garantizar la unidad de marca de Rotary. El logo que cargues se verá reflejado en la cabecera (header) de tu sitio específico.
                        </p>
                    </div>
                </div>

                {/* ── Club DNA Profile / Archetype ── */}
                {formData.archetype && (
                    <div className="mt-12 pt-8 border-t border-gray-100">
                        <div className="flex bg-white rounded-t-3xl border-x border-t border-gray-100 px-8 py-5 items-center gap-3">
                            <Dna className="w-6 h-6 text-rotary-blue" />
                            <div>
                                <h2 className="text-xl font-black text-gray-800 tracking-tight">ADN de tu Club</h2>
                                <p className="text-xs text-gray-500 font-medium mt-0.5">Perfil de inteligencia comercial según tu onboarding.</p>
                            </div>
                        </div>
                        <div className="bg-white border-x border-b border-gray-100 rounded-b-3xl p-8 pt-4 shadow-sm">
                            <ClubArchetypeCard
                                result={formData.archetype}
                                clubName={formData.name || 'Tu Club'}
                                clubColors={{ primary: '#013388', secondary: '#E29C00' }}
                                hideCTAs={true}
                            />
                        </div>
                    </div>
                )}
            </form>
        </AdminLayout>
    );
};

export default ClubProfile;
