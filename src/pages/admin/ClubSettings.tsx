import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/admin/AdminLayout';
import { useClub } from '../../contexts/ClubContext';
import { Save, Globe, MessageSquare, Phone, Palette, Upload, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

const ClubSettings: React.FC = () => {
    const { club } = useClub();
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
        facebook: '',
        instagram: '',
        twitter: '',
        youtube: '',
        primaryColor: '#013388',
        secondaryColor: '#E29C00',
        logo: '',
    });
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(false);

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
                facebook: club.social?.facebook || '',
                instagram: club.social?.instagram || '',
                twitter: club.social?.twitter || '',
                youtube: club.social?.youtube || '',
                primaryColor: club.colors?.primary || '#013388',
                secondaryColor: club.colors?.secondary || '#E29C00',
                logo: club.logo || '',
            });
        }
    }, [club]);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        console.log('Archivo seleccionado:', file.name);
        // window.alert('Iniciando subida de: ' + file.name);

        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', 'logos');

        try {
            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const targetUrl = `${apiUrl}/media/upload`.replace(/\/+/g, '/').replace(':/', '://'); // Clean double slashes

            console.log('Target API URL:', targetUrl);

            const response = await fetch(targetUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData
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
            window.alert('ERROR DE SUBIDA: ' + error.message);
            toast.error(`Error al subir: ${error.message}`);
        } finally {
            setUploading(false);
            if (e.target) e.target.value = ''; // Reset to allow re-selecting same file
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
                body: JSON.stringify(formData)
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
                <p className="text-gray-500 text-sm">v1.2.8 - Formatos Extendidos (SVG/JPG/PNG)</p>
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
                    </div>
                </div>

                {/* Logo Section */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-rotary-blue" /> Logo del Club
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
                                Sube el logo oficial de tu club. Se recomienda formato PNG con fondo transparente o SVG.
                            </p>
                            <label className="inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2.5 rounded-full font-bold cursor-pointer transition-colors">
                                <Upload className="w-4 h-4" />
                                {uploading ? 'Subiendo...' : 'Seleccionar Archivo'}
                                <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                    handleLogoUpload(e);
                                }} disabled={uploading} />
                            </label>
                        </div>
                    </div>
                </div>

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
                </div>

                {/* Redes Sociales */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-6 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-rotary-blue" /> Redes Sociales (URLs completas)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Facebook</label>
                            <input type="text" name="facebook" value={formData.facebook} onChange={handleChange} className="w-full px-4 py-2 rounded-lg border border-gray-200 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Instagram</label>
                            <input type="text" name="instagram" value={formData.instagram} onChange={handleChange} className="w-full px-4 py-2 rounded-lg border border-gray-200 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">Twitter / X</label>
                            <input type="text" name="twitter" value={formData.twitter} onChange={handleChange} className="w-full px-4 py-2 rounded-lg border border-gray-200 outline-none" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">YouTube</label>
                            <input type="text" name="youtube" value={formData.youtube} onChange={handleChange} className="w-full px-4 py-2 rounded-lg border border-gray-200 outline-none" />
                        </div>
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
                <div className="text-right">
                    <span className="text-[10px] text-gray-300">v1.2.5 - Diagnóstico de Subida Activo</span>
                </div>
            </form>
        </AdminLayout>
    );
};

export default ClubSettings;
