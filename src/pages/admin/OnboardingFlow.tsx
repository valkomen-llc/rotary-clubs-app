import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowRight, ArrowLeft, Building2, Palette, Share2, ImageIcon,
    Camera, Rocket, CheckCircle2, Upload, X, Loader2, ShieldCheck, AlertTriangle, ExternalLink,
    Plus, Globe,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

const API = import.meta.env.VITE_API_URL || '/api';

// ══════════════════════════════════════════════════════════════════
// ── Step Components ─────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════

const STEPS = [
    { id: 'welcome', title: 'Bienvenida', icon: Rocket },
    { id: 'info', title: 'Información', icon: Building2 },
    { id: 'branding', title: 'Identidad', icon: Palette },
    { id: 'social', title: 'Redes', icon: Share2 },
    { id: 'images', title: 'Imágenes', icon: ImageIcon },
    { id: 'gallery', title: 'Galería', icon: Camera },
    { id: 'complete', title: '¡Listo!', icon: CheckCircle2 },
];

// ── Step 0: Welcome ──────────────────────────────────────────────
const StepWelcome: React.FC<{ onNext: () => void; clubName: string }> = ({ onNext, clubName }) => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mb-8 shadow-2xl shadow-blue-500/30">
            <Rocket className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-4xl font-black text-gray-900 mb-4 tracking-tight">
            ¡Bienvenido a ClubPlatform!
        </h1>
        <p className="text-lg text-gray-500 max-w-lg mb-2">
            Vamos a configurar el sitio web de <strong className="text-gray-900">{clubName}</strong> en unos pocos pasos.
        </p>
        <p className="text-sm text-gray-400 max-w-md mb-10">
            Al terminar, tu club tendrá presencia digital profesional con dominio .org y todas las herramientas de gestión.
        </p>
        <button onClick={onNext} className="flex items-center gap-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-xl shadow-blue-600/20 group">
            Comenzar configuración
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>
    </div>
);

// ── Step 1: Club Info ── name is read-only (comes from registration)
const StepClubInfo: React.FC<{ data: any; onChange: (d: any) => void }> = ({ data, onChange }) => (
    <div className="max-w-xl mx-auto">
        <h2 className="text-2xl font-black text-gray-900 mb-2">📋 Cuéntanos sobre tu club</h2>
        <p className="text-sm text-gray-400 mb-8">Esta información aparecerá en tu sitio web público.</p>
        <div className="space-y-5">
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nombre del club</label>
                <div className="flex items-center gap-2">
                    <input value={data.name || ''} readOnly
                        className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 cursor-not-allowed" />
                    <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Verificado desde tu registro en ClubPlatform</p>
            </div>
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Descripción del club *</label>
                <textarea value={data.description || ''} onChange={e => onChange({ ...data, description: e.target.value })} rows={3}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none" placeholder="Describe la misión y actividades de tu club..." />
            </div>
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Distrito Rotario *</label>
                <input value={data.district || ''} onChange={e => onChange({ ...data, district: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" placeholder="Ej: Distrito 4281" />
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Departamento / Provincia *</label>
                    <input value={data.state || ''} onChange={e => onChange({ ...data, state: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" placeholder="Valle del Cauca" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Ciudad *</label>
                    <input value={data.city || ''} onChange={e => onChange({ ...data, city: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" placeholder="Tu ciudad" />
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">País *</label>
                    <input value={data.country || ''} onChange={e => onChange({ ...data, country: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" placeholder="Colombia" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Teléfono</label>
                    <input value={data.phone || ''} onChange={e => onChange({ ...data, phone: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" placeholder="+57 300 000 0000" />
                </div>
            </div>
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Dirección</label>
                <input value={data.address || ''} onChange={e => onChange({ ...data, address: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" placeholder="Calle 10 #5-23, Centro" />
            </div>
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Email de contacto</label>
                <input value={data.email || ''} onChange={e => onChange({ ...data, email: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" placeholder="contacto@tuclub.org" />
            </div>
        </div>
    </div>
);

// ── Step 2: Branding ─────────────────────────────────────────────
const StepBranding: React.FC<{ data: any; onChange: (d: any) => void; onLogoUpload: (f: File) => void }> = ({ data, onChange, onLogoUpload }) => {
    const fileRef = useRef<HTMLInputElement>(null);
    return (
        <div className="max-w-xl mx-auto">
            <h2 className="text-2xl font-black text-gray-900 mb-2">🎨 Identidad Visual</h2>
            <p className="text-sm text-gray-400 mb-6">El logo y colores que representan a tu club.</p>
            <div className="space-y-6">
                {/* Brand Center Guide */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200/60 rounded-2xl p-5">
                    <div className="flex items-start gap-3 mb-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Palette className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-gray-900">Crea el logo oficial de tu club</h4>
                            <p className="text-xs text-gray-500 mt-0.5">Usa el Rotary Brand Center para generar tu marca oficial</p>
                        </div>
                    </div>
                    <div className="ml-11 space-y-2 text-xs text-gray-600 mb-4">
                        <div className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
                            <span>Selecciona la <strong>marca simplificada</strong> (Simplified)</span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span>
                            <span>Escribe el <strong>nombre de tu club rotario</strong></span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</span>
                            <span>Elige el esquema de color <strong>Azul Rotary con Dorado</strong></span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">4</span>
                            <span>Descarga en formato <strong>PNG</strong> y súbelo aquí abajo</span>
                        </div>
                    </div>
                    <a
                        href="https://brandcenter.rotary.org/es-xl/rotary-template?id=f368e943-4d64-4635-899f-4b2302380a21"
                        target="_blank" rel="noopener noreferrer"
                        className="ml-11 inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm"
                    >
                        Abrir Rotary Brand Center
                        <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                </div>

                {/* Logo upload */}
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Logo del club</label>
                    <div className="flex items-center gap-6">
                        <div
                            onClick={() => fileRef.current?.click()}
                            className="w-28 h-28 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all overflow-hidden"
                        >
                            {data.logo ? (
                                <img src={data.logo} alt="Logo" className="w-full h-full object-contain p-2" />
                            ) : (
                                <>
                                    <Upload className="w-6 h-6 text-gray-300 mb-1" />
                                    <span className="text-[10px] text-gray-400 font-bold">Subir logo</span>
                                </>
                            )}
                        </div>
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && onLogoUpload(e.target.files[0])} />
                        <div className="text-xs text-gray-400">
                            <p className="font-bold text-gray-500 mb-1">Formato aceptado:</p>
                            <p>• PNG con fondo transparente</p>
                            <p>• Mínimo 200×200px</p>
                            <p>• Descargado del Brand Center</p>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Color principal</label>
                        <div className="flex items-center gap-3">
                            <input type="color" value={data.colorPrimary || '#013388'} onChange={e => onChange({ ...data, colorPrimary: e.target.value })}
                                className="w-12 h-12 rounded-xl cursor-pointer border-2 border-gray-200" />
                            <input value={data.colorPrimary || '#013388'} onChange={e => onChange({ ...data, colorPrimary: e.target.value })}
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Color secundario</label>
                        <div className="flex items-center gap-3">
                            <input type="color" value={data.colorSecondary || '#E29C00'} onChange={e => onChange({ ...data, colorSecondary: e.target.value })}
                                className="w-12 h-12 rounded-xl cursor-pointer border-2 border-gray-200" />
                            <input value={data.colorSecondary || '#E29C00'} onChange={e => onChange({ ...data, colorSecondary: e.target.value })}
                                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-mono" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── Step 3: Social ───────────────────────────────────────────────
const SOCIAL_PLATFORMS = [
    { key: 'facebook', label: 'Facebook', icon: '🌐', placeholder: 'https://facebook.com/tuclub' },
    { key: 'instagram', label: 'Instagram', icon: '📸', placeholder: 'https://instagram.com/tuclub' },
    { key: 'twitter', label: 'X / Twitter', icon: '🐦', placeholder: 'https://x.com/tuclub' },
    { key: 'youtube', label: 'YouTube', icon: '📺', placeholder: 'https://youtube.com/@tuclub' },
    { key: 'linkedin', label: 'LinkedIn', icon: '💼', placeholder: 'https://linkedin.com/company/tuclub' },
    { key: 'tiktok', label: 'TikTok', icon: '🎵', placeholder: 'https://tiktok.com/@tuclub' },
];

// Suggested custom social platforms for the emoji picker hint
const SUGGESTED_CUSTOM = [
    { label: 'WhatsApp', icon: '💬' },
    { label: 'Telegram', icon: '✈️' },
    { label: 'Pinterest', icon: '📌' },
    { label: 'Threads', icon: '🧵' },
    { label: 'Snapchat', icon: '👻' },
    { label: 'Otro', icon: '🔗' },
];

interface CustomSocial {
    id: string;
    label: string;
    icon: string;
    url: string;
}

const StepSocial: React.FC<{ data: any; onChange: (d: any) => void }> = ({ data, onChange }) => {
    // custom networks stored in data.customSocial = CustomSocial[]
    const customs: CustomSocial[] = data.customSocial || [];
    const [showSuggestions, setShowSuggestions] = useState(false);

    const addCustom = (label = '', icon = '🔗') => {
        const newItem: CustomSocial = { id: Date.now().toString(), label, icon, url: '' };
        onChange({ ...data, customSocial: [...customs, newItem] });
        setShowSuggestions(false);
    };

    const updateCustom = (id: string, field: keyof CustomSocial, value: string) => {
        onChange({
            ...data,
            customSocial: customs.map(c => c.id === id ? { ...c, [field]: value } : c),
        });
    };

    const removeCustom = (id: string) => {
        onChange({ ...data, customSocial: customs.filter(c => c.id !== id) });
    };

    return (
        <div className="max-w-xl mx-auto">
            <h2 className="text-2xl font-black text-gray-900 mb-2">📱 Redes Sociales</h2>
            <p className="text-sm text-gray-400 mb-8">Conecta las redes sociales de tu club. Puedes dejar en blanco las que no tengas.</p>

            {/* ── Default platforms ── */}
            <div className="space-y-4">
                {SOCIAL_PLATFORMS.map(p => (
                    <div key={p.key} className="flex items-center gap-3">
                        <span className="text-xl w-8 text-center flex-shrink-0">{p.icon}</span>
                        <div className="flex-1">
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">{p.label}</label>
                            <input
                                value={(data.social || {})[p.key] || ''}
                                onChange={e => onChange({ ...data, social: { ...(data.social || {}), [p.key]: e.target.value } })}
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                placeholder={p.placeholder}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Divider ── */}
            <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-[11px] font-bold text-gray-300 uppercase tracking-widest">Otras redes</span>
                <div className="flex-1 h-px bg-gray-100" />
            </div>

            {/* ── Custom platforms list ── */}
            {customs.length > 0 && (
                <div className="space-y-3 mb-4">
                    {customs.map(c => (
                        <div key={c.id} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl p-3">
                            {/* Emoji picker (inline input) */}
                            <input
                                value={c.icon}
                                onChange={e => updateCustom(c.id, 'icon', e.target.value)}
                                className="w-10 h-10 text-center text-xl bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 flex-shrink-0 cursor-pointer"
                                maxLength={4}
                                title="Escribe o pega un emoji"
                            />
                            <div className="flex-1 flex flex-col gap-1.5">
                                <input
                                    value={c.label}
                                    onChange={e => updateCustom(c.id, 'label', e.target.value)}
                                    placeholder="Nombre de la red (ej: WhatsApp)"
                                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                />
                                <input
                                    value={c.url}
                                    onChange={e => updateCustom(c.id, 'url', e.target.value)}
                                    placeholder="https://..."
                                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                />
                            </div>
                            <button
                                onClick={() => removeCustom(c.id)}
                                className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-300 hover:text-red-400 hover:bg-red-50 transition-all flex-shrink-0"
                                title="Eliminar"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Add custom button + quick suggestions ── */}
            <div className="relative">
                <button
                    onClick={() => setShowSuggestions(s => !s)}
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl py-3 text-sm font-bold text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50/50 transition-all"
                >
                    <Plus className="w-4 h-4" />
                    Agregar otra red social
                </button>

                {/* Quick-pick suggestions dropdown */}
                {showSuggestions && (
                    <div className="absolute bottom-full left-0 right-0 mb-2 bg-white border border-gray-200 rounded-2xl shadow-xl p-3 z-10">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Selección rápida</p>
                        <div className="grid grid-cols-3 gap-2 mb-2">
                            {SUGGESTED_CUSTOM.map(s => (
                                <button
                                    key={s.label}
                                    onClick={() => addCustom(s.label, s.icon)}
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-all border border-gray-100 hover:border-blue-200"
                                >
                                    <span className="text-base">{s.icon}</span>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => addCustom()}
                            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-bold text-gray-400 hover:bg-gray-50 transition-all border border-dashed border-gray-200"
                        >
                            <Globe className="w-3.5 h-3.5" /> Agregar en blanco
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Step 4: Site Images ──────────────────────────────────────────
const ImageUploadBox: React.FC<{ label: string; value: string; onUpload: (f: File) => void; onClear: () => void }> = ({ label, value, onUpload, onClear }) => {
    const ref = useRef<HTMLInputElement>(null);
    return (
        <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{label}</label>
            <div className="relative rounded-xl border-2 border-dashed border-gray-200 overflow-hidden hover:border-blue-400 transition-colors cursor-pointer"
                onClick={() => !value && ref.current?.click()}>
                {value ? (
                    <div className="relative">
                        <img src={value} alt={label} className="w-full h-40 object-cover" />
                        <button onClick={e => { e.stopPropagation(); onClear(); }}
                            className="absolute top-2 right-2 bg-black/60 text-white p-1 rounded-lg hover:bg-black/80">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-gray-300">
                        <Upload className="w-8 h-8 mb-2" />
                        <span className="text-xs font-bold">Click para subir</span>
                        <span className="text-[10px] text-gray-300">JPG, PNG — Máx 5MB</span>
                    </div>
                )}
            </div>
            <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])} />
        </div>
    );
};

const StepSiteImages: React.FC<{ data: any; onChange: (d: any) => void; onImageUpload: (key: string, f: File) => void }> = ({ data, onChange, onImageUpload }) => (
    <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-black text-gray-900 mb-2">🖼️ Imágenes del Sitio Web</h2>
        <p className="text-sm text-gray-400 mb-8">Estas imágenes aparecerán en las secciones principales de tu sitio.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <ImageUploadBox label="Imagen Hero Principal" value={data.heroImage || ''} onUpload={f => onImageUpload('heroImage', f)} onClear={() => onChange({ ...data, heroImage: '' })} />
            <ImageUploadBox label="Quiénes Somos" value={data.aboutImage || ''} onUpload={f => onImageUpload('aboutImage', f)} onClear={() => onChange({ ...data, aboutImage: '' })} />
            <ImageUploadBox label="Nuestros Proyectos" value={data.projectsImage || ''} onUpload={f => onImageUpload('projectsImage', f)} onClear={() => onChange({ ...data, projectsImage: '' })} />
            <ImageUploadBox label="Contacto" value={data.contactImage || ''} onUpload={f => onImageUpload('contactImage', f)} onClear={() => onChange({ ...data, contactImage: '' })} />
        </div>
    </div>
);

// ── Step 5: Gallery ──────────────────────────────────────────────
const StepGallery: React.FC<{ images: string[]; onUpload: (files: FileList) => void; onRemove: (i: number) => void }> = ({ images, onUpload, onRemove }) => {
    const ref = useRef<HTMLInputElement>(null);
    return (
        <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-black text-gray-900 mb-2">📸 Galería del Club</h2>
            <p className="text-sm text-gray-400 mb-8">Sube fotos de eventos, reuniones y proyectos de tu club.</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {images.map((img, i) => (
                    <div key={i} className="relative rounded-xl overflow-hidden aspect-square group">
                        <img src={img} alt="" className="w-full h-full object-cover" />
                        <button onClick={() => onRemove(i)}
                            className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ))}
                <div onClick={() => ref.current?.click()}
                    className="rounded-xl border-2 border-dashed border-gray-200 aspect-square flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all">
                    <Camera className="w-6 h-6 text-gray-300 mb-1" />
                    <span className="text-[10px] font-bold text-gray-400">Agregar</span>
                </div>
            </div>
            <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={e => e.target.files && onUpload(e.target.files)} />
            <p className="text-[11px] text-gray-400 mt-4 text-center">Puedes subir varias imágenes a la vez. Se recomienda fotos de alta resolución.</p>
        </div>
    );
};

// ── Step 6: Complete ─────────────────────────────────────────────
const StepComplete: React.FC<{ clubName: string; onFinish: () => void; saving: boolean }> = ({ clubName, onFinish, saving }) => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mb-8 shadow-2xl shadow-emerald-500/30">
            <CheckCircle2 className="w-12 h-12 text-white" />
        </div>
        <h1 className="text-4xl font-black text-gray-900 mb-4">🎉 ¡Felicidades!</h1>
        <p className="text-lg text-gray-500 max-w-lg mb-2">
            El sitio web de <strong className="text-gray-900">{clubName}</strong> está configurado.
        </p>
        <p className="text-sm text-gray-400 max-w-md mb-10">
            Tu sitio se activará y podrás acceder a todas las herramientas de administración: noticias, proyectos, eventos, tienda y más.
        </p>
        <button onClick={onFinish} disabled={saving}
            className="flex items-center gap-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:from-emerald-600 hover:to-emerald-700 transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-50">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Rocket className="w-5 h-5" />}
            {saving ? 'Activando sitio...' : 'Ir al Panel de Administración'}
        </button>
    </div>
);


// ══════════════════════════════════════════════════════════════════
// ── Main OnboardingFlow Page ────────────────────────────────────
// ══════════════════════════════════════════════════════════════════
const OnboardingFlow: React.FC = () => {
    const navigate = useNavigate();
    const { user, token } = useAuth();
    const [step, setStep] = useState(0);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [loadingClub, setLoadingClub] = useState(true);
    const [userClub, setUserClub] = useState<any>(null);

    // ── Fetch the user's ACTUAL assigned club (not from domain) ──
    useEffect(() => {
        if (!token || !user) return;
        // Super admins don't need onboarding
        if (user.role === 'administrator') { navigate('/admin/dashboard'); return; }

        const fetchUserClub = async () => {
            try {
                // Get user's club ID from login response
                const userClubId = user.clubId || user.club?.id;
                if (!userClubId) { setLoadingClub(false); return; }

                // Fetch THIS specific club (club_admin has access to /clubs/:id)
                const res = await fetch(`${API}/admin/clubs/${userClubId}`, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.ok) {
                    const myClub = await res.json();
                    setUserClub(myClub);
                    localStorage.setItem('rotary_club', JSON.stringify(myClub));
                }
            } catch (err) { console.error('Error fetching user club:', err); }
            setLoadingClub(false);
        };
        fetchUserClub();
    }, [token, user]);

    const [info, setInfo] = useState({
        name: '', description: '', district: '', state: '', city: '', country: 'Colombia',
        address: '', phone: '', email: '',
    });
    const [branding, setBranding] = useState({
        logo: '', colorPrimary: '#013388', colorSecondary: '#E29C00',
    });
    const [social, setSocial] = useState<any>({ social: {} });
    const [siteImages, setSiteImages] = useState<any>({});
    const [galleryImages, setGalleryImages] = useState<string[]>([]);

    // Update form when club data loads
    useEffect(() => {
        if (!userClub) return;

        // Parse settings array into a map for easy access
        const settingsMap: Record<string, string> = {};
        if (userClub.settings && Array.isArray(userClub.settings)) {
            userClub.settings.forEach((s: any) => {
                if (s.key) settingsMap[s.key] = s.value;
            });
        }

        setInfo({
            name: userClub.name || '',
            description: userClub.description || '',
            district: userClub.district || '',
            state: settingsMap['club_state'] || userClub.state || '',
            city: userClub.city || '',
            country: userClub.country || 'Colombia',
            address: settingsMap['contact_address'] || userClub.contact?.address || '',
            phone: settingsMap['contact_phone'] || userClub.contact?.phone || '',
            email: settingsMap['contact_email'] || userClub.contact?.email || '',
        });

        setBranding({
            logo: userClub.logo || '',
            colorPrimary: settingsMap['color_primary'] || userClub.colors?.primary || '#013388',
            colorSecondary: settingsMap['color_secondary'] || userClub.colors?.secondary || '#E29C00',
        });

        // Load social links
        const savedSocial = settingsMap['social_links']
            ? JSON.parse(settingsMap['social_links'])
            : (userClub.social || {});
        const savedCustomSocial = settingsMap['custom_social_links']
            ? JSON.parse(settingsMap['custom_social_links']).map((c: any) => ({ ...c, id: c.id || Date.now().toString() + Math.random() }))
            : (userClub.customSocial || []);
        setSocial({ social: savedSocial, customSocial: savedCustomSocial });

        // Load site images
        const savedSiteImages = settingsMap['site_images']
            ? JSON.parse(settingsMap['site_images'])
            : (userClub.siteImages || {});
        setSiteImages(savedSiteImages);

        // Load gallery images
        const savedGallery = settingsMap['gallery_images']
            ? JSON.parse(settingsMap['gallery_images'])
            : [];
        if (savedGallery.length > 0) setGalleryImages(savedGallery);

        // Resume to saved onboarding step
        const savedStep = parseInt(settingsMap['onboarding_step'] || '0');
        if (savedStep > 0 && savedStep < STEPS.length - 1) {
            setStep(savedStep);
        }
    }, [userClub]);

    const clubId = userClub?.id || user?.clubId || user?.club?.id;

    // ── Upload helper ──
    const uploadFile = async (file: File): Promise<string> => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${API}/media/upload`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
        });
        const data = await res.json();
        return data.url || data.secure_url || '';
    };

    const handleLogoUpload = async (file: File) => {
        setUploading(true);
        try {
            const url = await uploadFile(file);
            if (url) setBranding(b => ({ ...b, logo: url }));
        } catch { /* ignore */ }
        setUploading(false);
    };

    const handleSiteImageUpload = async (key: string, file: File) => {
        setUploading(true);
        try {
            const url = await uploadFile(file);
            if (url) setSiteImages((s: any) => ({ ...s, [key]: url }));
        } catch { /* ignore */ }
        setUploading(false);
    };

    const handleGalleryUpload = async (files: FileList) => {
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                const url = await uploadFile(file);
                if (url) setGalleryImages(prev => [...prev, url]);
            }
        } catch { /* ignore */ }
        setUploading(false);
    };

    // ── Save progress per step ──
    const saveStepData = async () => {
        if (!clubId || !token) return;
        const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

        try {
            // ── Step 1: Club Info ──────────────────────────────────────
            // Saves: name, description, district, city, country (Club table)
            //        state, address, phone, email (Settings table)
            if (step === 1) {
                await fetch(`${API}/admin/clubs/${clubId}`, {
                    method: 'PUT', headers,
                    body: JSON.stringify({
                        name: info.name,
                        description: info.description,
                        district: info.district,
                        city: info.city,
                        country: info.country,
                        // These go to Settings via the controller
                        email: info.email,
                        phone: info.phone,
                        address: info.address,
                        state: info.state,
                    }),
                });
            }

            // ── Step 2: Branding ──────────────────────────────────────
            // Saves: logo (Club table), colorPrimary, colorSecondary (Settings)
            if (step === 2) {
                await fetch(`${API}/admin/clubs/${clubId}`, {
                    method: 'PUT', headers,
                    body: JSON.stringify({
                        logo: branding.logo,
                        primaryColor: branding.colorPrimary,
                        secondaryColor: branding.colorSecondary,
                    }),
                });
            }

            // ── Step 3: Social Networks ───────────────────────────────
            // Saves: socialLinks (Settings), customSocialLinks (Settings)
            if (step === 3) {
                const socialPayload: Record<string, string> = { ...(social.social || {}) };
                const customs = social.customSocial || [];
                await fetch(`${API}/admin/clubs/${clubId}`, {
                    method: 'PUT', headers,
                    body: JSON.stringify({
                        socialLinks: socialPayload,
                        ...(customs.length > 0 ? {
                            customSocialLinks: customs.map((c: any) => ({
                                label: c.label,
                                icon: c.icon,
                                url: c.url,
                            })),
                        } : {}),
                    }),
                });
            }

            // ── Step 4: Site Images ───────────────────────────────────
            // Saves: site image URLs as Settings
            if (step === 4) {
                await fetch(`${API}/admin/clubs/${clubId}`, {
                    method: 'PUT', headers,
                    body: JSON.stringify({
                        siteImages: siteImages,
                    }),
                });
            }

            // ── Step 5: Gallery Images ────────────────────────────────
            // Saves: gallery image URLs as Settings
            if (step === 5 && galleryImages.length > 0) {
                await fetch(`${API}/admin/clubs/${clubId}`, {
                    method: 'PUT', headers,
                    body: JSON.stringify({
                        galleryImages: galleryImages,
                    }),
                });
            }

            // Always save step progress
            await fetch(`${API}/admin/clubs/${clubId}/onboarding-step`, {
                method: 'PATCH', headers,
                body: JSON.stringify({ step }),
            });
        } catch (err) { console.error('Save step error:', err); }
    };

    const handleNext = async () => {
        await saveStepData();
        setStep(s => Math.min(s + 1, STEPS.length - 1));
    };

    const handleBack = () => setStep(s => Math.max(s - 1, 0));

    // ── Finish onboarding ──
    const handleFinish = async () => {
        if (!clubId || !token) return;
        setSaving(true);
        try {
            await fetch(`${API}/admin/clubs/${clubId}/complete-onboarding`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            // Update localStorage club data
            const stored = localStorage.getItem('rotary_club');
            if (stored) {
                const parsed = JSON.parse(stored);
                parsed.onboardingCompleted = true;
                parsed.status = 'active';
                localStorage.setItem('rotary_club', JSON.stringify(parsed));
            }
            window.location.href = '/#/admin/dashboard';
            window.location.reload();
        } catch (err) {
            console.error('Finish error:', err);
        }
        setSaving(false);
    };

    const progress = Math.round((step / (STEPS.length - 1)) * 100);

    return (
        <div className="min-h-screen bg-white flex flex-col">
            {/* Top Bar */}
            {step > 0 && step < STEPS.length - 1 && (
                <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-lg border-b border-gray-100">
                    <div className="max-w-3xl mx-auto flex items-center justify-between px-6 py-4">
                        <button onClick={handleBack} className="flex items-center gap-2 text-gray-400 hover:text-gray-700 text-sm font-bold transition-colors">
                            <ArrowLeft className="w-4 h-4" /> Atrás
                        </button>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-gray-400">Paso {step} de {STEPS.length - 2}</span>
                            <div className="w-32 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    </div>
                </header>
            )}

            {/* Loading overlay */}
            {uploading && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="bg-white rounded-2xl p-6 shadow-2xl flex items-center gap-4">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                        <span className="text-sm font-bold text-gray-700">Subiendo archivo...</span>
                    </div>
                </div>
            )}

            {/* Step Content */}
            <main className="flex-1 flex items-center justify-center px-6 py-12">
                <div className="w-full max-w-3xl">
                    {/* Loading state */}
                    {loadingClub && (
                        <div className="flex flex-col items-center justify-center min-h-[60vh]">
                            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                            <p className="text-sm text-gray-400 font-bold">Cargando información del club...</p>
                        </div>
                    )}
                    {/* No club assigned error */}
                    {!loadingClub && !userClub && (
                        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
                            <div className="w-20 h-20 rounded-3xl bg-amber-100 flex items-center justify-center mb-6">
                                <AlertTriangle className="w-10 h-10 text-amber-500" />
                            </div>
                            <h2 className="text-2xl font-black text-gray-900 mb-3">Club no asignado</h2>
                            <p className="text-sm text-gray-500 max-w-md mb-6">
                                Tu cuenta no tiene un club rotario asignado. Al crear tu cuenta en ClubPlatform,
                                debes indicar a qué club perteneces para poder configurar el sitio web.
                            </p>
                            <p className="text-xs text-gray-400 max-w-md">
                                Contacta al administrador de la plataforma para que te asigne un club.
                            </p>
                        </div>
                    )}
                    {/* Normal wizard steps */}
                    {!loadingClub && userClub && (
                        <>
                            {step === 0 && <StepWelcome onNext={() => setStep(1)} clubName={info.name || 'tu club'} />}
                            {step === 1 && <StepClubInfo data={info} onChange={setInfo} />}
                            {step === 2 && <StepBranding data={branding} onChange={setBranding} onLogoUpload={handleLogoUpload} />}
                            {step === 3 && <StepSocial data={social} onChange={setSocial} />}
                            {step === 4 && <StepSiteImages data={siteImages} onChange={setSiteImages} onImageUpload={handleSiteImageUpload} />}
                            {step === 5 && <StepGallery images={galleryImages} onUpload={handleGalleryUpload} onRemove={i => setGalleryImages(prev => prev.filter((_, idx) => idx !== i))} />}
                            {step === 6 && <StepComplete clubName={info.name || 'tu club'} onFinish={handleFinish} saving={saving} />}
                        </>
                    )}
                </div>
            </main>

            {/* Bottom Navigation (not on welcome or complete) */}
            {step > 0 && step < STEPS.length - 1 && (
                <footer className="sticky bottom-0 bg-white/80 backdrop-blur-lg border-t border-gray-100">
                    <div className="max-w-3xl mx-auto flex items-center justify-between px-6 py-4">
                        <button onClick={handleBack} className="flex items-center gap-2 text-gray-400 hover:text-gray-700 text-sm font-bold transition-colors">
                            <ArrowLeft className="w-4 h-4" /> Atrás
                        </button>
                        <div className="flex items-center gap-3">
                            {/* Step indicator dots */}
                            {STEPS.slice(1, -1).map((s, i) => (
                                <div key={s.id} className={`w-2 h-2 rounded-full transition-all ${i + 1 <= step ? 'bg-blue-500' : 'bg-gray-200'}`} />
                            ))}
                        </div>
                        <button onClick={handleNext}
                            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20">
                            Siguiente <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </footer>
            )}
        </div>
    );
};

export default OnboardingFlow;
