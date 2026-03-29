import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useClub } from '../../contexts/ClubContext';
import { useAuth } from '../../hooks/useAuth';
import { Save, Globe, MessageSquare, Phone, Palette, Upload, Image as ImageIcon, Store, Dna, Settings as SettingsIcon } from 'lucide-react';
import { toast } from 'sonner';
import ClubArchetypeCard from '../../components/admin/ClubArchetypeCard';

const ClubSettings: React.FC = () => {
    const { club } = useClub();
    const { user } = useAuth();
    const isSuperAdmin = user?.role === 'administrator';

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
        favicon: '',
        logoHeaderSize: 200,
        autoGenerateCalendar: true,
    });
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(false);

    // Payment config state
    const [useStripe, setUseStripe] = useState(false);
    const [stripePublicKey, setStripePublicKey] = useState('');
    const [stripeSecretKey, setStripeSecretKey] = useState('');

    const [usePaypal, setUsePaypal] = useState(false);
    const [paypalSandbox, setPaypalSandbox] = useState(true);
    const [paypalClientId, setPaypalClientId] = useState('');
    const [paypalSecretKey, setPaypalSecretKey] = useState('');

    const [mapStyle, setMapStyle] = useState<string>('m');
    const [savingMap, setSavingMap] = useState(false);

    useEffect(() => {
        if (isSuperAdmin) {
            const token = localStorage.getItem('rotary_token');
            fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/global-map-style`, { headers: { Authorization: `Bearer ${token}` } })
                .then(r => r.json())
                .then(data => setMapStyle(data.mapStyle || 'm'))
                .catch(() => { });
        }
    }, [isSuperAdmin]);

    useEffect(() => {
        if (club) {
            setFormData({
                name: club.name || '',
                description: club.description || '',
                city: club.city || '',
                country: club.country || '',
                domain: club.domain || '',
                subdomain: club.subdomain || '',
                email: club.contact?.email || '',
                phone: club.contact?.phone || '',
                address: club.contact?.address || '',
                socialLinks: club.social || [],
                primaryColor: club.colors?.primary || '#013388',
                secondaryColor: club.colors?.secondary || '#E29C00',
                logo: club.logo || '',
                footerLogo: club.footerLogo || '',
                endPolioLogo: club.endPolioLogo || '',
                favicon: club.favicon || '',
                logoHeaderSize: club.logoHeaderSize ?? 200,
                autoGenerateCalendar: club.settings?.auto_generate_calendar !== false,
            });

            // If platform supports paymentConfigs from populated backend
            if (club.paymentConfigs && Array.isArray(club.paymentConfigs)) {
                const stripeConfig = club.paymentConfigs.find((c: any) => c.provider === 'stripe');
                setUseStripe(stripeConfig?.enabled || false);
                setStripePublicKey(stripeConfig?.publicKey || '');
                setStripeSecretKey(''); // Don't pre-fill secret for security

                const paypalConfig = club.paymentConfigs.find((c: any) => c.provider === 'paypal');
                setUsePaypal(paypalConfig?.enabled || false);
                setPaypalClientId(paypalConfig?.publicKey || '');
                setPaypalSecretKey('');
                try {
                    const settings = paypalConfig?.settings ? JSON.parse(paypalConfig.settings) : {};
                    setPaypalSandbox(settings.sandbox !== false);
                } catch (e) {
                    setPaypalSandbox(true);
                }
            }
        }
    }, [club]);

    // Auto-crop whitespace from logo on the client using Canvas API
    const autoCropImage = (file: File): Promise<Blob> => {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d')!;
                ctx.drawImage(img, 0, 0);
                URL.revokeObjectURL(url);

                const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);

                let top = height, bottom = 0, left = width, right = 0;
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const idx = (y * width + x) * 4;
                        const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
                        // Consider pixel as "content" if not near-white and not transparent
                        const isContent = a > 10 && !(r > 225 && g > 225 && b > 225);
                        if (isContent) {
                            if (y < top) top = y;
                            if (y > bottom) bottom = y;
                            if (x < left) left = x;
                            if (x > right) right = x;
                        }
                    }
                }

                // Add small padding (4px) around the detected content
                const pad = 4;
                top = Math.max(0, top - pad);
                left = Math.max(0, left - pad);
                bottom = Math.min(height - 1, bottom + pad);
                right = Math.min(width - 1, right + pad);

                const cropW = right - left + 1;
                const cropH = bottom - top + 1;

                // If crop found valid content, crop; otherwise return original
                if (cropW > 0 && cropH > 0 && (cropW < width || cropH < height)) {
                    const cropped = document.createElement('canvas');
                    cropped.width = cropW;
                    cropped.height = cropH;
                    cropped.getContext('2d')!.drawImage(canvas, left, top, cropW, cropH, 0, 0, cropW, cropH);
                    cropped.toBlob((blob) => resolve(blob || file), 'image/png');
                } else {
                    // No crop needed, return original
                    canvas.toBlob((blob) => resolve(blob || file), 'image/png');
                }
            };
            img.onerror = () => resolve(file); // Fallback to original on error
            img.src = url;
        });
    };

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            // Auto-crop whitespace on client side using Canvas
            const croppedBlob = await autoCropImage(file);
            const croppedFile = new File([croppedBlob], file.name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' });

            const uploadData = new FormData();
            uploadData.append('file', croppedFile);
            uploadData.append('folder', 'logos');

            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const targetUrl = `${apiUrl}/media/upload?folder=logos&clubId=${club.id}`.replace(/\/+/g, '/').replace(':/', '://');

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: uploadData
            });

            if (response.ok) {
                const data = await response.json();
                setFormData(prev => ({ ...prev, logo: data.url }));
                toast.success('Logo subido con éxito');
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falla en el servidor');
            }
        } catch (error: any) {
            console.error('Upload error:', error);
            toast.error(`Error al subir: ${error.message}`);
        } finally {
            setUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleFooterLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formDataUpload = new FormData();
        formDataUpload.append('file', file);
        formDataUpload.append('folder', 'logos-footer');

        try {
            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const targetUrl = `${apiUrl}/media/upload?folder=logos-footer&clubId=${club.id}`.replace(/\/+/g, '/').replace(':/', '://');

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formDataUpload
            });

            if (response.ok) {
                const data = await response.json();
                setFormData(prev => ({ ...prev, footerLogo: data.url }));
                toast.success('Logo del footer subido con éxito');
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falla en el servidor');
            }
        } catch (error: any) {
            console.error('Footer logo upload error:', error);
            toast.error(`Error al subir: ${error.message}`);
        } finally {
            setUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleEndPolioLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formDataUpload = new FormData();
        formDataUpload.append('file', file);
        formDataUpload.append('folder', 'logos-endpolio');

        try {
            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const targetUrl = `${apiUrl}/media/upload?folder=logos-endpolio&clubId=${club.id}`.replace(/\/+/g, '/').replace(':/', '://');

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formDataUpload
            });

            if (response.ok) {
                const data = await response.json();
                setFormData(prev => ({ ...prev, endPolioLogo: data.url }));
                toast.success('Logo End Polio subido con éxito');
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falla en el servidor');
            }
        } catch (error: any) {
            console.error('End Polio logo upload error:', error);
            toast.error(`Error al subir: ${error.message}`);
        } finally {
            setUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleFaviconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const formDataUpload = new FormData();
        formDataUpload.append('file', file);
        formDataUpload.append('folder', 'favicons');

        try {
            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const targetUrl = `${apiUrl}/media/upload?folder=favicons&clubId=${club.id}`.replace(/\/+/g, '/').replace(':/', '://');

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formDataUpload
            });

            if (response.ok) {
                const data = await response.json();
                setFormData(prev => ({ ...prev, favicon: data.url }));
                toast.success('Favicon subido con éxito');
            } else {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Falla en el servidor');
            }
        } catch (error: any) {
            console.error('Favicon upload error:', error);
            toast.error(`Error al subir: ${error.message}`);
        } finally {
            setUploading(false);
            if (e.target) e.target.value = '';
        }
    };

    const handleSaveMapStyle = async () => {
        setSavingMap(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const res = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/global-map-style`, {
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const token = localStorage.getItem('rotary_token');
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/admin/clubs/${club.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    ...formData,
                    useStripe, stripePublicKey, stripeSecretKey,
                    usePaypal, paypalSandbox, paypalClientId, paypalSecretKey
                })
            });

            if (response.ok) {
                toast.success('Configuración actualizada correctamente');
                // Optional: reload to see changes
                setTimeout(() => window.location.reload(), 1500);
            } else {
                throw new Error('Error al actualizar');
            }
        } catch (error) {
            toast.error('Hubo un error al guardar los cambios');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    if (!club) {
        return (
            <AdminLayout>
                <div className="flex items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-gray-100">
                    <p className="text-gray-500 italic">Cargando información del club...</p>
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout>
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-800">Configuración del Club</h1>
                <p className="text-gray-500 text-sm">Gestiona la identidad y contacto de tu club.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
                {/* Información Básica */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-rotary-blue" /> Información del Club
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Nombre del Club</label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-rotary-blue outline-none"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Descripción / Misión</label>
                            <textarea
                                name="description"
                                value={formData.description}
                                onChange={handleChange}
                                rows={3}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-rotary-blue outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Ciudad</label>
                            <input
                                type="text"
                                name="city"
                                value={formData.city}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-rotary-blue outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">País</label>
                            <input
                                type="text"
                                name="country"
                                value={formData.country}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-rotary-blue outline-none"
                            />
                        </div>

                        {isSuperAdmin && (
                            <div className="md:col-span-2 mt-4 pt-4 border-t border-gray-100">
                                <label className="block text-xs font-bold text-gray-800 uppercase mb-2 flex items-center gap-2">
                                    Dominio Personalizado
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                        Solo Súper Admin
                                    </span>
                                </label>
                                <input
                                    type="text"
                                    name="domain"
                                    value={formData.domain}
                                    onChange={handleChange}
                                    placeholder="ej. rotarymiciudad.org"
                                    className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-rotary-blue outline-none bg-gray-50"
                                />
                                {formData.domain && !formData.domain.includes('.vercel.app') && (
                                    <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-5">
                                        <h4 className="font-bold text-emerald-800 flex items-center gap-2 mb-2">
                                            <Globe className="w-4 h-4" /> Instrucciones de Configuración DNS
                                        </h4>
                                        <p className="text-sm text-emerald-700 mb-3">
                                            Hemos ordenado a nuestro servidor web ({formData.domain}) aceptar tráfico en tu nombre. Para que tu página funcione, debes ir a la empresa donde compraste tu dominio (GoDaddy, Hostinger, etc.) y crear el siguiente registro:
                                        </p>
                                        <div className="bg-white p-4 rounded border border-emerald-100 flex items-center justify-between shadow-sm">
                                            <div className="grid grid-cols-3 gap-8 w-full">
                                                <div>
                                                    <span className="block text-xs text-gray-500 uppercase font-bold">Tipo</span>
                                                    <span className="font-mono font-bold">A</span>
                                                </div>
                                                <div>
                                                    <span className="block text-xs text-gray-500 uppercase font-bold">Nombre / Host</span>
                                                    <span className="font-mono font-bold">@</span>
                                                </div>
                                                <div>
                                                    <span className="block text-xs text-gray-500 uppercase font-bold">Valor (Punta hacia)</span>
                                                    <span className="font-mono font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">76.76.21.21</span>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-xs text-emerald-600 mt-3 font-medium">✨ La propagación de DNS suele demorar entre 15 y 60 minutos en internet global. Durante este tiempo el dominio se auto-conectará y generará un Certificado SSL (candado verde) automáticamente.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Logo Section */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-rotary-blue" /> Logo del Header (Principal)
                    </h3>
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <div className="w-48 h-48 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50">
                            {formData.logo ? (
                                <img src={formData.logo} alt="Logo preview" className="w-full h-full object-contain p-4" />
                            ) : (
                                <ImageIcon className="w-12 h-12 text-gray-300" />
                            )}
                        </div>
                        <div className="flex-1 space-y-4">
                            <p className="text-sm text-gray-500">
                                Sube el logo oficial que se mostrará en la barra de navegación superior.
                            </p>
                            <label className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-full font-bold cursor-pointer transition-colors">
                                <Upload className="w-4 h-4" />
                                {uploading ? 'Subiendo...' : 'Seleccionar Logo Header'}
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                    handleLogoUpload(e);
                                }} disabled={uploading} />
                            </label>

                            {/* Logo size slider — Super Admin only */}
                            {isSuperAdmin && (
                                <div className="mt-4 pt-4 border-t border-gray-100">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-bold text-gray-400 uppercase">Tamaño del Logo en el Header</label>
                                        <span className="text-xs font-mono font-bold text-rotary-blue bg-blue-50 px-2 py-0.5 rounded-full">
                                            {formData.logoHeaderSize}px
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min={60}
                                        max={300}
                                        step={5}
                                        value={formData.logoHeaderSize}
                                        onChange={(e) => setFormData(prev => ({ ...prev, logoHeaderSize: Number(e.target.value) }))}
                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-rotary-blue"
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
                    </div>
                </div>

                {/* Footer Logo Section - Limited to Super Admin */}
                {isSuperAdmin && (
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex justify-between items-start mb-6">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <ImageIcon className="w-5 h-5 text-rotary-blue" /> Logo del Footer
                            </h3>
                        </div>
                        <div className="flex flex-col md:flex-row items-center gap-8">
                            <div className="w-48 h-48 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50">
                                {formData.footerLogo ? (
                                    <img src={formData.footerLogo} alt="Footer Logo preview" className="w-full h-full object-contain p-4" />
                                ) : (
                                    <ImageIcon className="w-12 h-12 text-gray-300" />
                                )}
                            </div>
                            <div className="flex-1 space-y-4">
                                <p className="text-sm text-gray-500">
                                    Sube el logo que se mostrará en el pie de página de tu sitio. Como Súper Admin, puedes cambiar este logo para este club.
                                </p>
                                <label className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-full font-bold cursor-pointer transition-colors">
                                    <Upload className="w-4 h-4" />
                                    {uploading ? 'Subiendo...' : 'Seleccionar Logo Footer'}
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                        handleFooterLogoUpload(e);
                                    }} disabled={uploading} />
                                </label>
                            </div>
                        </div>
                    </div>
                )}

                {/* End Polio Logo Section - Limited to Super Admin */}
                {isSuperAdmin && (
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex justify-between items-start mb-6">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <ImageIcon className="w-5 h-5 text-rotary-blue" /> Logo End Polio Now
                            </h3>
                        </div>
                        <div className="flex flex-col md:flex-row items-center gap-8">
                            <div className="w-48 h-48 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50">
                                {formData.endPolioLogo ? (
                                    <img src={formData.endPolioLogo} alt="End Polio Logo preview" className="w-full h-full object-contain p-4" />
                                ) : (
                                    <ImageIcon className="w-12 h-12 text-gray-300" />
                                )}
                            </div>
                            <div className="flex-1 space-y-4">
                                <p className="text-sm text-gray-500">
                                    Sube el logo oficial de End Polio Now para tu footer. Puedes actualizar el logo de la causa para este club.
                                </p>
                                <label className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-full font-bold cursor-pointer transition-colors">
                                    <Upload className="w-4 h-4" />
                                    {uploading ? 'Subiendo...' : 'Seleccionar Logo End Polio'}
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                        handleEndPolioLogoUpload(e);
                                    }} disabled={uploading} />
                                </label>
                            </div>
                        </div>
                    </div>
                )}

                {/* Favicon Section - Limited to Super Admin */}
                {isSuperAdmin && (
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex justify-between items-start mb-6">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <ImageIcon className="w-5 h-5 text-rotary-blue" /> Favicon del Sitio
                            </h3>
                        </div>
                        <div className="flex flex-col md:flex-row items-center gap-8">
                            <div className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center overflow-hidden bg-gray-50">
                                {formData.favicon ? (
                                    <img src={formData.favicon} alt="Favicon preview" className="w-full h-full object-contain p-2" />
                                ) : (
                                    <ImageIcon className="w-8 h-8 text-gray-300" />
                                )}
                            </div>
                            <div className="flex-1 space-y-4">
                                <p className="text-sm text-gray-500">
                                    Sube el ícono que se mostrará en la pestaña del navegador. Se recomienda un archivo .png cuadrado o .ico. Como Súper Admin, puedes cambiar esto para el sitio.
                                </p>
                                <label className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-full font-bold cursor-pointer transition-colors">
                                    <Upload className="w-4 h-4" />
                                    {uploading ? 'Subiendo...' : 'Seleccionar Favicon'}
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                        handleFaviconUpload(e);
                                    }} disabled={uploading} />
                                </label>
                            </div>
                        </div>
                    </div>
                )}

                {/* Contacto */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <Phone className="w-5 h-5 text-rotary-blue" /> Contacto
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Email de Contacto</label>
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-rotary-blue outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Teléfono</label>
                            <input
                                type="text"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-rotary-blue outline-none"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Dirección Física</label>
                            <input
                                type="text"
                                name="address"
                                value={formData.address}
                                onChange={handleChange}
                                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-rotary-blue outline-none"
                            />
                        </div>
                    </div>
                    {/* Redes Sociales */}
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-rotary-blue" /> Redes Sociales Dinámicas
                            </h3>
                            <button
                                type="button"
                                onClick={() => setFormData({ ...formData, socialLinks: [...formData.socialLinks, { platform: 'Nueva Red', url: '' }] })}
                                className="text-xs bg-rotary-blue text-white px-3 py-1.5 rounded-lg hover:bg-blue-800 font-bold transition-colors"
                            >
                                + Añadir Red Social
                            </button>
                        </div>
                        {formData.socialLinks.length === 0 ? (
                            <p className="text-sm text-gray-500 italic text-center py-4 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                No hay redes sociales configuradas. Haz clic en "Añadir Red Social" para comenzar.
                            </p>
                        ) : (
                            <div className="space-y-4">
                                {formData.socialLinks.map((link, index) => (
                                    <div key={index} className="flex flex-col md:flex-row gap-4 items-start md:items-center bg-gray-50 p-3 rounded-lg border border-gray-100">
                                        <div className="w-full md:w-1/3">
                                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Plataforma / Nombre</label>
                                            <input
                                                type="text"
                                                value={link.platform}
                                                onChange={(e) => {
                                                    const newLinks = [...formData.socialLinks];
                                                    newLinks[index].platform = e.target.value;
                                                    setFormData({ ...formData, socialLinks: newLinks });
                                                }}
                                                placeholder="ej. Facebook, Linktree..."
                                                className="w-full px-4 py-2 rounded-lg border border-gray-200 outline-none"
                                            />
                                        </div>
                                        <div className="w-full md:w-flex-1 md:flex-grow">
                                            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Enlace / URL Completa</label>
                                            <input
                                                type="url"
                                                value={link.url}
                                                onChange={(e) => {
                                                    const newLinks = [...formData.socialLinks];
                                                    newLinks[index].url = e.target.value;
                                                    setFormData({ ...formData, socialLinks: newLinks });
                                                }}
                                                placeholder="https://..."
                                                className="w-full px-4 py-2 rounded-lg border border-gray-200 outline-none"
                                            />
                                        </div>
                                        <div className="pt-5 md:pt-6">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newLinks = formData.socialLinks.filter((_, i) => i !== index);
                                                    setFormData({ ...formData, socialLinks: newLinks });
                                                }}
                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded transition-colors text-sm font-bold"
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Apariencia */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <Palette className="w-5 h-5 text-rotary-blue" /> Identidad Visual
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Color Primario</label>
                            <div className="flex gap-2">
                                <input type="color" name="primaryColor" value={formData.primaryColor} onChange={handleChange} className="w-10 h-10 rounded cursor-pointer border-none" />
                                <input type="text" value={formData.primaryColor} readOnly className="flex-1 px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-500" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Color Secundario</label>
                            <div className="flex gap-2">
                                <input type="color" name="secondaryColor" value={formData.secondaryColor} onChange={handleChange} className="w-10 h-10 rounded cursor-pointer border-none" />
                                <input type="text" value={formData.secondaryColor} readOnly className="flex-1 px-4 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-500" />
                            </div>
                        </div>
                    </div>
                </div>
                {/* Pagos / E-commerce */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <Store className="w-5 h-5 text-rotary-blue" /> Pagos y Tienda (Gateway API)
                    </h3>

                    <div className="space-y-6">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 border border-gray-100 rounded-xl bg-gray-50">
                            <div>
                                <h4 className="font-bold text-gray-900">Procesar pagos de la página de mi Club de forma Directa</h4>
                                <p className="text-sm text-gray-500">Si se desactiva, todo aporte será procesado por la cuenta matriz y se retendrá un 5% de comisión + costos de plataforma.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={useStripe} onChange={(e) => setUseStripe(e.target.checked)} />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rotary-blue"></div>
                            </label>
                        </div>

                        {useStripe && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 border border-blue-100 rounded-xl bg-blue-50/30">
                                <div className="md:col-span-2">
                                    <p className="text-sm text-blue-800 font-medium">
                                        Para recibir el 100% de los fondos de tus aportes a tu cuenta propia en tiempo real, ingresa tus llaves API de la pasarela. (Stripe)
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Clave Pública (Publishable Key)</label>
                                    <input
                                        type="text"
                                        value={stripePublicKey}
                                        onChange={(e) => setStripePublicKey(e.target.value)}
                                        className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-rotary-blue outline-none"
                                        placeholder="pk_live_..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Clave Secreta (Secret Key)</label>
                                    <input
                                        type="password"
                                        value={stripeSecretKey}
                                        onChange={(e) => setStripeSecretKey(e.target.value)}
                                        className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-rotary-blue outline-none"
                                        placeholder="sk_live_... (déjalo vacío si no la actualizarás)"
                                    />
                                    <p className="text-[10px] mt-1 text-gray-500">Se ocultará al instante.</p>
                                </div>
                            </div>
                        )}

                        {/* PayPal Module */}
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 border border-gray-100 rounded-xl bg-gray-50 mt-8">
                            <div>
                                <h4 className="font-bold text-gray-900">Activar PayPal como Método Alternativo</h4>
                                <p className="text-sm text-gray-500">Permite procesar pagos a través de una cuenta de PayPal separada.</p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={usePaypal} onChange={(e) => setUsePaypal(e.target.checked)} />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rotary-blue"></div>
                            </label>
                        </div>

                        {usePaypal && (
                            <div className="flex flex-col gap-6 p-4 border border-blue-100 rounded-xl bg-blue-50/30">
                                <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
                                    <div>
                                        <p className="font-bold text-gray-800 text-sm">Modo Sandbox (Pruebas)</p>
                                        <p className="text-xs text-gray-500">Habilita esta opción para realizar transacciones ficticias sin cobrar dinero real.</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" className="sr-only peer" checked={paypalSandbox} onChange={(e) => setPaypalSandbox(e.target.checked)} />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                                    </label>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Client ID (API Key)</label>
                                        <input
                                            type="text"
                                            value={paypalClientId}
                                            onChange={(e) => setPaypalClientId(e.target.value)}
                                            className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-rotary-blue outline-none"
                                            placeholder="AfT_..."
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Secret Key</label>
                                        <input
                                            type="password"
                                            value={paypalSecretKey}
                                            onChange={(e) => setPaypalSecretKey(e.target.value)}
                                            className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:ring-2 focus:ring-rotary-blue outline-none"
                                            placeholder="EE2_... (déjalo vacío si no la actualizarás)"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* SUPER ADMIN: Global Configuration */}
                {isSuperAdmin && (
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-emerald-100 ring-1 ring-emerald-500/10 relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl tracking-wider">
                            GLOBAL PLATFORM
                        </div>
                        <h3 className="font-bold text-gray-900 mb-6 flex items-center gap-2">
                            <Globe className="w-5 h-5 text-emerald-600" /> Configuración Global de la Plataforma
                        </h3>

                        <div className="flex flex-col md:flex-row gap-6 p-5 border border-gray-100 rounded-xl bg-gray-50/50">
                            <div className="md:w-1/3">
                                <h4 className="font-bold text-gray-900 text-sm mb-1">Mapas de Google</h4>
                                <p className="text-xs text-gray-500">
                                    Aplica un estilo visual a los mapas de las <strong>secciones de contacto</strong> de TODOS los clubes que usen la plataforma.
                                </p>
                            </div>
                            <div className="md:w-2/3">
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-2">
                                    Estilo del Mapa
                                </label>
                                <div className="flex gap-3">
                                    <select
                                        value={mapStyle}
                                        onChange={(e) => setMapStyle(e.target.value)}
                                        className="flex-1 bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-rotary-blue/20 outline-none transition-all"
                                    >
                                        <option value="m">Estándar (Predeterminado)</option>
                                        <option value="k">Satélite (Sin etiquetas)</option>
                                        <option value="h">Híbrido (Satélite + Etiquetas)</option>
                                        <option value="p">Terreno / Relieve</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={handleSaveMapStyle}
                                        disabled={savingMap}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg flex items-center justify-center gap-2 font-bold text-sm transition-colors disabled:opacity-50"
                                    >
                                        {savingMap ? 'Guardando...' : (
                                            <>
                                                <Save className="w-4 h-4" /> Aplicar Estilo
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* AI & Strategy Settings */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <Dna className="w-5 h-5 text-rotary-blue" /> Inteligencia Artificial & Estrategia
                    </h3>

                    {isSuperAdmin && (
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-5 mb-8 border border-emerald-100 rounded-xl bg-emerald-50 max-w-2xl">
                            <div>
                                <h4 className="font-bold text-gray-900 border-b border-emerald-200 pb-2 mb-2 flex items-center gap-2">
                                    <SettingsIcon className="w-4 h-4 text-emerald-600" />
                                    Generación Automática de Parrilla
                                    <span className="bg-emerald-600 text-white text-[9px] px-2 py-0.5 rounded uppercase tracking-wider">Super Admin</span>
                                </h4>
                                <p className="text-sm text-gray-600 mt-1">
                                    Si esta opción está activa, la plataforma ordenará automáticamente al equipo de Agentes IA diseñar el calendario editorial completo del mes al finalizar el Onboarding.
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={formData.autoGenerateCalendar}
                                    onChange={(e) => setFormData(prev => ({ ...prev, autoGenerateCalendar: e.target.checked }))}
                                />
                                <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                            </label>
                        </div>
                    )}

                    {club.archetype ? (
                        <div className="mt-8 border-t border-gray-100 pt-8">
                            <ClubArchetypeCard
                                result={club.archetype}
                                clubName={club.name}
                                clubColors={{ primary: club.colors?.primary || '#013388', secondary: club.colors?.secondary || '#E29C00' }}
                                onFinish={() => toast.success('Arquetipo guardado en la configuración')}
                                saving={false}
                            />
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500 italic text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                            Aún no se ha generado el Club DNA Profile (Arquetipo) para este club. Este proceso sucede automáticamente al terminar el Onboarding.
                        </p>
                    )}
                </div>

                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={loading}
                        className="flex items-center gap-2 bg-rotary-blue text-white px-8 py-3 rounded-full font-bold hover:bg-sky-800 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                    >
                        <Save className="w-5 h-5" />
                        {loading ? 'Guardando...' : 'Guardar Cambios'}
                    </button>
                </div>
                <div className="hidden">
                    <span className="text-[10px] text-gray-300">v1.2.9</span>
                </div>
            </form >
        </AdminLayout >
    );
};

export default ClubSettings;
