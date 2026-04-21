import React, { useState, useEffect } from 'react';
import { Save, Layout, Globe, Users, Building2, Image as ImageIcon, Link as LinkIcon, Plus, Trash2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface FooterItem {
    label: string;
    href: string;
    external?: boolean;
}

interface FooterSkinConfig {
    logoTop: string;
    logoBottom: string;
    menu1Title: string;
    menu1Items: FooterItem[];
    menu2Title: string;
    menu2Items: FooterItem[];
}

const FooterSystem = () => {
    const [activeTab, setActiveTab] = useState<'club' | 'district' | 'association' | 'colrotarios'>('club');
    const [skins, setSkins] = useState<Record<string, FooterSkinConfig>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchSkins();
    }, []);

    const fetchSkins = async () => {
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/system/footer-skins`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('rotary_token')}` }
            });
            if (response.ok) {
                const data = await response.json();
                setSkins(data);
            }
        } catch (error) {
            toast.error('Error al cargar configuraciones');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/system/footer-skins/${activeTab}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('rotary_token')}`
                },
                body: JSON.stringify({ config: skins[activeTab] })
            });

            if (response.ok) {
                toast.success(`Configuración ${activeTab} guardada exitosamente`);
            } else {
                toast.error('Error al guardar');
            }
        } catch (error) {
            toast.error('Error de conexión');
        } finally {
            setIsSaving(false);
        }
    };

    const updateSkin = (field: keyof FooterSkinConfig, value: any) => {
        setSkins(prev => ({
            ...prev,
            [activeTab]: {
                ...prev[activeTab],
                [field]: value
            }
        }));
    };

    const addMenuItem = (menu: 'menu1Items' | 'menu2Items') => {
        const currentItems = skins[activeTab][menu];
        updateSkin(menu, [...currentItems, { label: 'Nuevo Link', href: '#' }]);
    };

    const removeMenuItem = (menu: 'menu1Items' | 'menu2Items', index: number) => {
        const currentItems = [...skins[activeTab][menu]];
        currentItems.splice(index, 1);
        updateSkin(menu, currentItems);
    };

    const updateMenuItem = (menu: 'menu1Items' | 'menu2Items', index: number, field: keyof FooterItem, value: any) => {
        const currentItems = [...skins[activeTab][menu]];
        currentItems[index] = { ...currentItems[index], [field]: value };
        updateSkin(menu, currentItems);
    };

    if (isLoading) return <div className="p-8 text-center text-gray-500">Cargando sistema de footers...</div>;

    const currentConfig = skins[activeTab];

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-black text-rotary-blue flex items-center gap-3">
                        <Layout className="w-8 h-8" />
                        Gestión Global de Footers
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Configura las 4 pieles arquitectónicas del ecosistema Rotary</p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-rotary-blue text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                >
                    <Save className="w-5 h-5" />
                    {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </div>

            {/* Tabs de Navegación */}
            <div className="flex flex-wrap gap-2 bg-gray-100/50 p-1.5 rounded-2xl border border-gray-200">
                {[
                    { id: 'club', label: 'Rotary Club', icon: Building2 },
                    { id: 'district', label: 'Distrito', icon: Globe },
                    { id: 'association', label: 'Asociación', icon: Users },
                    { id: 'colrotarios', label: 'Colrotarios', icon: Building2 }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-bold transition-all ${
                            activeTab === tab.id 
                            ? 'bg-white text-rotary-blue shadow-md border border-gray-100' 
                            : 'text-gray-500 hover:bg-white/50'
                        }`}
                    >
                        <tab.icon className="w-5 h-5" />
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Visual Settings: Logos */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
                        <h3 className="font-black text-gray-800 flex items-center gap-2">
                            <ImageIcon className="w-5 h-5 text-rotary-blue" />
                            Logos del Portal
                        </h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Logo Superior (Blanco preferible)</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-rotary-blue outline-none"
                                        value={currentConfig.logoTop}
                                        onChange={(e) => updateSkin('logoTop', e.target.value)}
                                        placeholder="URL del logo superior"
                                    />
                                </div>
                                <div className="mt-2 p-4 bg-rotary-blue rounded-lg flex justify-center">
                                    <img src={currentConfig.logoTop} className="h-8 object-contain" alt="Preview" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Logo Inferior (End Polio / Youth)</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-rotary-blue outline-none"
                                        value={currentConfig.logoBottom}
                                        onChange={(e) => updateSkin('logoBottom', e.target.value)}
                                        placeholder="URL del logo inferior"
                                    />
                                </div>
                                <div className="mt-2 p-4 bg-slate-100 rounded-lg flex justify-center">
                                    <img src={currentConfig.logoBottom} className="h-10 object-contain" alt="Preview" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Settings: Menus */}
                <div className="lg:col-span-2 space-y-8">
                    {[
                        { key: 'menu1Items' as const, titleKey: 'menu1Title' as const, icon: LinkIcon, color: 'bg-blue-600' },
                        { key: 'menu2Items' as const, titleKey: 'menu2Title' as const, icon: Plus, color: 'bg-emerald-600' }
                    ].map((menuSet) => (
                        <div key={menuSet.key} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                <div className="flex items-center gap-4">
                                    <div className={`${menuSet.color} p-2.5 rounded-xl text-white shadow-lg shadow-blue-100`}>
                                        <menuSet.icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <input 
                                            type="text"
                                            className="text-lg font-black bg-transparent border-b border-dashed border-gray-300 focus:border-rotary-blue outline-none"
                                            value={currentConfig[menuSet.titleKey]}
                                            onChange={(e) => updateSkin(menuSet.titleKey, e.target.value)}
                                        />
                                        <p className="text-gray-400 text-xs mt-1">Columna {menuSet.key === 'menu1Items' ? '2' : '3'} del footer</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => addMenuItem(menuSet.key)}
                                    className="flex items-center gap-2 text-sm font-bold text-rotary-blue bg-blue-50 px-4 py-2 rounded-lg hover:bg-blue-100 transition-all"
                                >
                                    <Plus className="w-4 h-4" /> Agregar Link
                                </button>
                            </div>

                            <div className="p-6 space-y-3">
                                {currentConfig[menuSet.key].map((item, idx) => (
                                    <div key={idx} className="flex flex-col md:flex-row gap-3 p-4 bg-gray-50 rounded-xl group border border-transparent hover:border-blue-100 hover:bg-white hover:shadow-md transition-all">
                                        <div className="flex-1">
                                            <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Texto del Link</label>
                                            <input 
                                                type="text"
                                                className="w-full bg-transparent font-bold text-gray-700 outline-none"
                                                value={item.label}
                                                onChange={(e) => updateMenuItem(menuSet.key, idx, 'label', e.target.value)}
                                            />
                                        </div>
                                        <div className="flex-[2]">
                                            <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Ruta o URL (#/blog, /quienes-somos...)</label>
                                            <div className="flex items-center gap-2">
                                                <input 
                                                    type="text"
                                                    className="w-full bg-transparent font-medium text-blue-600 outline-none truncate"
                                                    value={item.href}
                                                    onChange={(e) => updateMenuItem(menuSet.key, idx, 'href', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 ml-auto">
                                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg shadow-sm">
                                                <input 
                                                    type="checkbox"
                                                    id={`ext-${menuSet.key}-${idx}`}
                                                    checked={!!item.external}
                                                    onChange={(e) => updateMenuItem(menuSet.key, idx, 'external', e.target.checked)}
                                                    className="w-4 h-4 text-rotary-blue rounded border-gray-300"
                                                />
                                                <label htmlFor={`ext-${menuSet.key}-${idx}`} className="text-[10px] font-bold text-gray-500 whitespace-nowrap">Externo</label>
                                            </div>
                                            <button 
                                                onClick={() => removeMenuItem(menuSet.key, idx)}
                                                className="p-2 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {currentConfig[menuSet.key].length === 0 && (
                                    <div className="text-center py-8 text-gray-400 font-medium italic border-2 border-dashed border-gray-100 rounded-2xl">
                                        No hay links configurados en esta columna
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Preview Section */}
            <div className="bg-slate-900 p-8 rounded-3xl shadow-2xl relative overflow-hidden">
                 <div className="absolute top-4 right-4 bg-emerald-500 text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest shadow-lg">Vista Previa Real-Time</div>
                 <div className="grid grid-cols-1 md:grid-cols-4 gap-12 opacity-80 pointer-events-none grayscale-[0.2]">
                    <div className="space-y-6">
                        <img src={currentConfig.logoTop} className="h-10 object-contain" alt="Logo Top" />
                        <img src={currentConfig.logoBottom} className="h-12 object-contain" alt="Logo Bottom" />
                    </div>
                    <div>
                        <h4 className="text-white font-black text-sm mb-6">{currentConfig.menu1Title}</h4>
                        <ul className="space-y-3">
                            {currentConfig.menu1Items.slice(0, 4).map((item, i) => (
                                <li key={i} className="text-white/40 text-xs font-bold flex items-center gap-2">
                                    <ArrowRight className="w-3 h-3 text-rotary-blue" />
                                    {item.label}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h4 className="text-white font-black text-sm mb-6">{currentConfig.menu2Title}</h4>
                        <ul className="space-y-3">
                             {currentConfig.menu2Items.slice(0, 4).map((item, i) => (
                                <li key={i} className="text-white/40 text-xs font-bold flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                                    {item.label}
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="space-y-4">
                        <h4 className="text-white font-black text-sm mb-4 tracking-tight">Suscríbete al Newsletter</h4>
                        <div className="h-10 bg-white/5 border border-white/10 rounded-lg" />
                    </div>
                 </div>
            </div>
        </div>
    );
};

export default FooterSystem;
