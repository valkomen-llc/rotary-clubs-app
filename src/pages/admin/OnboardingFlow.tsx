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
    { id: 'modules', title: 'Módulos', icon: Globe },
    { id: 'complete', title: '¡Listo!', icon: CheckCircle2 },
];

// ── Step 0: Welcome ──────────────────────────────────────────────
const StepWelcome: React.FC<{ onNext: () => void; clubName: string }> = ({ onNext, clubName }) => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#019fcb] to-[#017da3] flex items-center justify-center mb-8 shadow-2xl shadow-blue-900/30">
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
        <button onClick={onNext} className="flex items-center gap-3 bg-gradient-to-r from-[#019fcb] to-[#017da3] text-white px-8 py-4 rounded-2xl font-bold text-lg hover:from-[#017da3] hover:to-[#016585] transition-all shadow-xl shadow-blue-900/20 group">
            Comenzar configuración
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>
    </div>
);

// File type helpers
const DOC_ICONS: Record<string, string> = {
    'application/pdf': '📄', 'application/msword': '📝', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
    'text/plain': '📃', 'text/csv': '📊', 'text/markdown': '📃', 'application/rtf': '📃',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊', 'application/vnd.ms-excel': '📊',
};
const getDocIcon = (type: string) => DOC_ICONS[type] || '📎';
const formatSize = (bytes: number) => bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1048576).toFixed(1) + ' MB';

// ── Step 1: Club Info ── name is read-only (comes from registration)
const StepClubInfo: React.FC<{
    data: any; onChange: (d: any) => void;
    documents: any[]; onDocUpload: (files: FileList) => void; onDocDelete: (id: string) => void; uploadingDoc: boolean;
}> = ({ data, onChange, documents, onDocUpload, onDocDelete, uploadingDoc }) => {
    const [dragOver, setDragOver] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    return (
    <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-black text-gray-900 mb-2">📋 Cuéntanos sobre tu club</h2>
        <p className="text-sm text-gray-400 mb-8">Esta información aparecerá en tu sitio web público.</p>
        <div className="space-y-5">
            {/* Row 1: Nombre | Distrito | Fecha constitutiva */}
            <div className="grid grid-cols-3 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Nombre del club</label>
                    <div className="flex items-center gap-2">
                        <input value={data.name || ''} readOnly
                            className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 cursor-not-allowed" />
                        <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Verificado desde tu registro</p>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Distrito Rotario *</label>
                    <div className="flex items-center gap-2">
                        <input value={data.district || ''} readOnly
                            className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 cursor-not-allowed" />
                        {data.district && <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0" />}
                    </div>
                    {data.district && <p className="text-[10px] text-gray-400 mt-1">Verificado desde tu registro</p>}
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Fecha acta constitutiva</label>
                    <input type="date" value={data.foundedDate || ''} onChange={e => onChange({ ...data, foundedDate: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all" />
                    <p className="text-[10px] text-gray-400 mt-1">Fecha de fundación del club</p>
                </div>
            </div>

            {/* Descripción */}
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Descripción del club *</label>
                <textarea value={data.description || ''} onChange={e => onChange({ ...data, description: e.target.value })} rows={3}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all resize-none" placeholder="Describe la misión y actividades de tu club..." />
            </div>

            {/* ── Documentos del club ── */}
            <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">📎 Documentos del club</label>
                <p className="text-[11px] text-gray-400 mb-3">Sube documentos institucionales para construir la base de conocimiento de tu club (actas, reglamentos, historia, etc.)</p>
                <div
                    onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) onDocUpload(e.dataTransfer.files); }}
                    onClick={() => fileRef.current?.click()}
                    className={"border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all " + (dragOver ? 'border-[#019fcb] bg-[#019fcb]/5' : 'border-gray-200 hover:border-gray-300 bg-gray-50/50')}
                >
                    <input ref={fileRef} type="file" className="hidden" multiple
                        accept=".pdf,.doc,.docx,.txt,.rtf,.md,.csv,.xlsx,.xls"
                        onChange={e => { if (e.target.files?.length) onDocUpload(e.target.files); e.target.value = ''; }} />
                    {uploadingDoc ? (
                        <div className="flex items-center justify-center gap-3">
                            <Loader2 className="w-5 h-5 animate-spin text-[#019fcb]" />
                            <span className="text-sm text-gray-500 font-medium">Subiendo documento...</span>
                        </div>
                    ) : (
                        <>
                            <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                            <p className="text-sm text-gray-500 font-medium">Arrastra archivos aquí o <span className="text-[#019fcb] font-bold">selecciona</span></p>
                            <p className="text-[10px] text-gray-400 mt-1">PDF, Word, TXT, CSV, Excel — Máx. 10MB</p>
                        </>
                    )}
                </div>
                {documents.length > 0 && (
                    <div className="mt-3 space-y-2">
                        {documents.map((doc: any) => (
                            <div key={doc.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-4 py-3 group hover:border-gray-200 transition-all">
                                <span className="text-lg">{getDocIcon(doc.fileType)}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-700 truncate">{doc.fileName}</p>
                                    <p className="text-[10px] text-gray-400">{formatSize(doc.fileSize)}</p>
                                </div>
                                <button onClick={() => onDocDelete(doc.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Row: País | Departamento / Provincia */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">País *</label>
                    <div className="flex items-center gap-2">
                        <input value={data.country || ''} readOnly
                            className="w-full bg-gray-100 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-600 cursor-not-allowed" />
                        {data.country && <ShieldCheck className="w-5 h-5 text-emerald-500 flex-shrink-0" />}
                    </div>
                    {data.country && <p className="text-[10px] text-gray-400 mt-1">Verificado desde tu registro</p>}
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Departamento / Provincia *</label>
                    <input value={data.state || ''} onChange={e => onChange({ ...data, state: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all" placeholder="Valle del Cauca" />
                </div>
            </div>

            {/* Row: Ciudad | Dirección */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Ciudad *</label>
                    <input value={data.city || ''} onChange={e => onChange({ ...data, city: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all" placeholder="Tu ciudad" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Dirección</label>
                    <input value={data.address || ''} onChange={e => onChange({ ...data, address: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all" placeholder="Calle 10 #5-23, Centro" />
                </div>
            </div>

            {/* Row: Teléfono | Email de contacto */}
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Teléfono</label>
                    <input value={data.phone || ''} onChange={e => onChange({ ...data, phone: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all" placeholder="+57 300 000 0000" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Email de contacto</label>
                    <input value={data.email || ''} onChange={e => onChange({ ...data, email: e.target.value })}
                        className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all" placeholder="contacto@tuclub.org" />
                </div>
            </div>
        </div>
    </div>
    );
};

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
                        <div className="w-8 h-8 rounded-lg bg-[#019fcb] flex items-center justify-center flex-shrink-0 mt-0.5">
                            <Palette className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-gray-900">Crea el logo oficial de tu club</h4>
                            <p className="text-xs text-gray-500 mt-0.5">Usa el Rotary Brand Center para generar tu marca oficial</p>
                        </div>
                    </div>
                    <div className="ml-11 space-y-2 text-xs text-gray-600 mb-4">
                        <div className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#019fcb] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
                            <span>Selecciona la <strong>marca simplificada</strong> (Simplified)</span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#019fcb] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span>
                            <span>Escribe el <strong>nombre de tu club rotario</strong></span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#019fcb] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</span>
                            <span>Elige el esquema de color <strong>Azul Rotary con Dorado</strong></span>
                        </div>
                        <div className="flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#019fcb] text-white flex items-center justify-center text-[10px] font-bold flex-shrink-0">4</span>
                            <span>Descarga en formato <strong>PNG</strong> y súbelo aquí abajo</span>
                        </div>
                    </div>
                    <a
                        href="https://brandcenter.rotary.org/es-xl/rotary-template?id=f368e943-4d64-4635-899f-4b2302380a21"
                        target="_blank" rel="noopener noreferrer"
                        className="ml-11 inline-flex items-center gap-2 bg-[#019fcb] text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-[#017da3] transition-colors shadow-sm"
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
                            className="w-28 h-28 rounded-2xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-all overflow-hidden bg-white"
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
                                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all"
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
                                className="w-10 h-10 text-center text-xl bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 flex-shrink-0 cursor-pointer"
                                maxLength={4}
                                title="Escribe o pega un emoji"
                            />
                            <div className="flex-1 flex flex-col gap-1.5">
                                <input
                                    value={c.label}
                                    onChange={e => updateCustom(c.id, 'label', e.target.value)}
                                    placeholder="Nombre de la red (ej: WhatsApp)"
                                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all"
                                />
                                <input
                                    value={c.url}
                                    onChange={e => updateCustom(c.id, 'url', e.target.value)}
                                    placeholder="https://..."
                                    className="w-full bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all"
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
                    className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-2xl py-3 text-sm font-bold text-gray-400 hover:border-blue-400 hover:text-[#019fcb] hover:bg-blue-50/50 transition-all"
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

// ── Step 4: Site Images (matches admin ImageDistribution) ────────
const SITE_IMG_DEFAULTS = {
    hero: [
        { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&h=700&fit=crop', alt: 'Trabajo en equipo' },
        { url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&h=700&fit=crop', alt: 'Promoción de la paz' },
        { url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1600&h=700&fit=crop', alt: 'Lucha contra enfermedades' },
        { url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=1600&h=700&fit=crop', alt: 'Educación' },
        { url: 'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=1600&h=700&fit=crop', alt: 'Desarrollo económico' },
    ],
    causes: [
        { url: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=500&h=500&fit=crop', alt: 'Promoción de la paz' },
        { url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&h=500&fit=crop', alt: 'Lucha contra enfermedades' },
        { url: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=500&h=500&fit=crop', alt: 'Agua y saneamiento' },
        { url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=500&h=500&fit=crop', alt: 'Salud materno-infantil' },
        { url: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=500&h=500&fit=crop', alt: 'Educación básica' },
        { url: 'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=500&h=500&fit=crop', alt: 'Desarrollo económico' },
        { url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=500&h=500&fit=crop', alt: 'Medio ambiente' },
    ],
    foundation: [{ url: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=1600&h=800&fit=crop', alt: 'Fundación Rotaria' }],
    join: [{ url: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=600&h=500&fit=crop', alt: 'Únete a Rotary' }],
    aboutHero: [{ url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1600&h=500&fit=crop', alt: 'Quiénes Somos' }],
    aboutCarousel: [
        { url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=250&fit=crop', alt: 'Protegemos el medio ambiente' },
        { url: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=400&h=250&fit=crop', alt: 'Somos gente de acción' },
        { url: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=400&h=250&fit=crop', alt: 'Promovemos la paz' },
        { url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&h=250&fit=crop', alt: 'Combatimos enfermedades' },
        { url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=400&h=250&fit=crop', alt: 'Protegemos a madres e hijos' },
    ],
};

interface SiteImgSubGroup { key: string; subLabel: string; count: number; aspect: string; }
interface SiteImgContainer { key: string; label: string; desc: string; count: number; aspect: string; groups?: SiteImgSubGroup[]; }

const SITE_CONTAINERS: SiteImgContainer[] = [
    { key: 'hero', label: 'Hero — Slider Principal', desc: '5 imágenes de slide con rotación automática. Tamaño ideal: 1600×700px.', count: 5, aspect: '16/7' },
    { key: 'causes', label: 'Áreas de Interés — Causas', desc: '7 imágenes para las tarjetas de causas Rotary. Tamaño ideal: 500×500px.', count: 7, aspect: '1/1' },
    { key: 'foundation', label: 'Fundación Rotaria', desc: '1 imagen de fondo para la sección de la Fundación.', count: 1, aspect: '16/8' },
    { key: 'join', label: 'Sección Únete', desc: '1 imagen motivacional para la sección de reclutamiento.', count: 1, aspect: '6/5' },
    {
        key: 'about', label: 'Quiénes Somos', desc: 'Imágenes de la página Quiénes Somos: banner hero y carrusel de causas.', count: 6, aspect: '16/5',
        groups: [
            { key: 'aboutHero', subLabel: 'Hero — Banner', count: 1, aspect: '16/5' },
            { key: 'aboutCarousel', subLabel: 'Carrusel de Causas', count: 5, aspect: '8/5' },
        ],
    },
];

const StepSiteImages: React.FC<{
    data: any;
    onChange: (d: any) => void;
    onImageUpload: (key: string, f: File, index: number) => void;
}> = ({ data, onChange, onImageUpload }) => {
    const [expanded, setExpanded] = useState<Record<string, boolean>>({ hero: true });

    // Get slots for a given key, ensuring they always have the right length
    const getSlots = (key: string): { url: string; alt: string }[] => {
        const defaults = (SITE_IMG_DEFAULTS as any)[key] || [];
        const saved = data[key];
        if (Array.isArray(defaults)) {
            if (Array.isArray(saved) && saved.length === defaults.length) return saved;
            // Merge saved over defaults
            return defaults.map((d: any, i: number) => (saved?.[i] ? saved[i] : { ...d }));
        }
        return saved ? [saved] : [{ ...defaults }];
    };

    const isDefault = (key: string, index: number): boolean => {
        const defaults = (SITE_IMG_DEFAULTS as any)[key];
        const slots = getSlots(key);
        if (Array.isArray(defaults)) return slots[index]?.url === defaults[index]?.url;
        return slots[0]?.url === defaults?.url;
    };

    const fileRef = useRef<HTMLInputElement>(null);
    const [activeUpload, setActiveUpload] = useState<{ key: string; index: number } | null>(null);

    const triggerUpload = (key: string, index: number) => {
        setActiveUpload({ key, index });
        fileRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && activeUpload) {
            onImageUpload(activeUpload.key, file, activeUpload.index);
        }
        e.target.value = '';
    };

    const resetSlot = (key: string, index: number) => {
        const defaults = (SITE_IMG_DEFAULTS as any)[key];
        const newData = { ...data };
        if (Array.isArray(defaults)) {
            const slots = [...getSlots(key)];
            slots[index] = { ...defaults[index] };
            newData[key] = slots;
        } else {
            newData[key] = [{ ...defaults }];
        }
        onChange(newData);
    };

    return (
        <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-black text-gray-900 mb-2">🖼️ Imágenes del Sitio Web</h2>
            <p className="text-sm text-gray-400 mb-6">
                Personaliza las imágenes de cada sección de tu sitio. Haz clic en cualquier imagen para reemplazarla.
            </p>

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            <div className="space-y-3">
                {SITE_CONTAINERS.map(container => {
                    const subGroups = container.groups || [{ key: container.key, subLabel: '', count: container.count, aspect: container.aspect }];
                    const totalCount = subGroups.reduce((sum, g) => sum + g.count, 0);
                    const totalCustom = subGroups.reduce((sum, g) => {
                        return sum + getSlots(g.key).filter((_, i) => !isDefault(g.key, i)).length;
                    }, 0);
                    const isOpen = expanded[container.key];

                    return (
                        <div key={container.key} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                            {/* Accordion Header */}
                            <button
                                onClick={() => setExpanded(prev => ({ ...prev, [container.key]: !prev[container.key] }))}
                                className="w-full px-5 py-4 flex items-center gap-3 hover:bg-gray-50/50 transition-colors text-left"
                            >
                                <ImageIcon className="w-4 h-4 text-[#019fcb] flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-bold text-gray-900 text-sm">{container.label}</h3>
                                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                            {totalCount} {totalCount === 1 ? 'imagen' : 'imágenes'}
                                        </span>
                                        {totalCustom > 0 && (
                                            <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-0.5">
                                                <CheckCircle2 className="w-2.5 h-2.5" /> {totalCustom} personalizadas
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-gray-400 mt-0.5">{container.desc}</p>
                                </div>
                                <ArrowRight className={`w-4 h-4 text-gray-300 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                            </button>

                            {/* Slots Grid */}
                            {isOpen && (
                                <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-5">
                                    {subGroups.map(group => {
                                        const slots = getSlots(group.key);
                                        return (
                                            <div key={group.key}>
                                                {container.groups && (
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                                                            {group.subLabel}
                                                        </span>
                                                        <span className="text-[9px] text-gray-400">{group.count} {group.count === 1 ? 'imagen' : 'imágenes'}</span>
                                                    </div>
                                                )}
                                                <div className={`grid gap-3 ${group.count === 1 ? 'grid-cols-1 max-w-sm' : group.count <= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-2 lg:grid-cols-5'}`}>
                                                    {slots.map((slot, idx) => {
                                                        const isDef = isDefault(group.key, idx);
                                                        return (
                                                            <div key={idx} className={`group relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${isDef ? 'border-gray-200 border-dashed' : 'border-emerald-300 shadow-md'}`}>
                                                                <div className="relative" style={{ aspectRatio: group.aspect }}>
                                                                    <img
                                                                        src={slot.url} alt={slot.alt}
                                                                        className="w-full h-full object-cover"
                                                                        onError={(e) => { (e.target as HTMLImageElement).src = SITE_IMG_DEFAULTS.hero[0].url; }}
                                                                    />
                                                                    {/* Hover overlay */}
                                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                                                                        <button
                                                                            onClick={() => triggerUpload(group.key, idx)}
                                                                            className="px-2.5 py-1.5 bg-white rounded-lg text-[10px] font-bold text-gray-800 hover:bg-gray-100 transition-colors flex items-center gap-1 shadow-lg"
                                                                        >
                                                                            <Upload className="w-3 h-3" /> Cambiar
                                                                        </button>
                                                                        {!isDef && (
                                                                            <button
                                                                                onClick={(e) => { e.stopPropagation(); resetSlot(group.key, idx); }}
                                                                                className="px-2.5 py-1.5 bg-red-500 rounded-lg text-[10px] font-bold text-white hover:bg-red-600 transition-colors flex items-center gap-1 shadow-lg"
                                                                            >
                                                                                <X className="w-3 h-3" /> Reset
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                    {/* Status badge */}
                                                                    <div className="absolute top-1.5 left-1.5">
                                                                        {isDef ? (
                                                                            <span className="px-1.5 py-0.5 bg-gray-900/60 text-white text-[8px] font-bold rounded-full backdrop-blur-sm uppercase">
                                                                                Por Defecto
                                                                            </span>
                                                                        ) : (
                                                                            <span className="px-1.5 py-0.5 bg-emerald-500 text-white text-[8px] font-bold rounded-full uppercase flex items-center gap-0.5">
                                                                                <CheckCircle2 className="w-2 h-2" /> Personalizada
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    {/* Slot number */}
                                                                    {group.count > 1 && (
                                                                        <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-white/90 text-gray-800 text-[9px] font-black flex items-center justify-center shadow">
                                                                            {idx + 1}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                {/* Alt text */}
                                                                <div className="p-1.5 bg-white">
                                                                    <p className="text-[10px] text-gray-500 truncate font-medium">{slot.alt}</p>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ── Step 5: Modules and Members ────────────────────────────────────
const StepModules: React.FC<{ data: any; onChange: (d: any) => void }> = ({ data, onChange }) => {
    const handleToggle = (key: string) => onChange({ ...data, [key]: !data[key] });

    return (
        <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-black text-gray-900 mb-2">⚙️ Módulos y Funciones</h2>
            <p className="text-sm text-gray-400 mb-8">
                Configura cuántos socios tiene tu club y activa las funciones que necesites en la plataforma.
            </p>

            <div className="space-y-8">
                {/* Toggles */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6">
                    <h3 className="text-sm font-bold text-gray-900 mb-2">Módulos de la Plataforma</h3>

                    {/* Cantidad de Socios — inline number input */}
                    <div className="flex items-center justify-between pb-4 border-b border-gray-50">
                        <div className="pr-4">
                            <h4 className="text-sm font-bold text-gray-900">Cantidad de Socios</h4>
                            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">Número de socios que conforman el club. En el siguiente paso podrás registrar su información.</p>
                        </div>
                        <input
                            type="number" min="1" max="200"
                            value={data.memberCount || ''}
                            onChange={(e) => onChange({ ...data, memberCount: parseInt(e.target.value) || 0 })}
                            className="w-24 flex-shrink-0 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all font-bold text-gray-700"
                            placeholder="20"
                        />
                    </div>

                    <ToggleRow
                        title="Proyectos y Causas"
                        description="Habilita la sección para publicar los proyectos de servicio del club."
                        active={data.hasProjects}
                        onToggle={() => handleToggle('hasProjects')}
                    />
                    <ToggleRow
                        title="Eventos y Calendario"
                        description="Habilita el calendario para reuniones y eventos del club."
                        active={data.hasEvents}
                        onToggle={() => handleToggle('hasEvents')}
                    />
                    <ToggleRow
                        title="Club Rotaract"
                        description="Mostrar un módulo dedicado al club Rotaract patrocinado."
                        active={data.hasRotaract}
                        onToggle={() => handleToggle('hasRotaract')}
                    />
                    <ToggleRow
                        title="Club Interact"
                        description="Mostrar un módulo dedicado estático al club Interact patrocinado."
                        active={data.hasInteract}
                        onToggle={() => handleToggle('hasInteract')}
                    />
                    <ToggleRow
                        title="Tienda Virtual (E-commerce)"
                        description="Habilita la tienda para recaudación de fondos y venta de artículos."
                        active={data.hasEcommerce}
                        onToggle={() => handleToggle('hasEcommerce')}
                    />
                    <ToggleRow
                        title="Estados Financieros (DIAN)"
                        description="Publicación obligatoria de status ESAL para transparencia en Colombia."
                        active={data.hasDian}
                        onToggle={() => handleToggle('hasDian')}
                    />
                    <ToggleRow
                        title="Intercambios de Jóvenes de Rotary"
                        description="Módulo para gestionar y publicar programas de intercambio juvenil del club."
                        active={data.hasYouthExchange}
                        onToggle={() => handleToggle('hasYouthExchange')}
                    />
                    <ToggleRow
                        title="Intercambios NGSE"
                        description="Módulo para gestionar intercambios profesionales del New Generations Service Exchange."
                        active={data.hasNGSE}
                        onToggle={() => handleToggle('hasNGSE')}
                    />
                    <ToggleRow
                        title="ROTEX"
                        description="Módulo dedicado a la comunidad de ex-intercambistas Rotary (ROTEX)."
                        active={data.hasRotex}
                        onToggle={() => handleToggle('hasRotex')}
                    />
                </div>
            </div>
        </div>
    );
};

const ToggleRow: React.FC<{ title: string; description: string; active: boolean; onToggle: () => void }> = ({ title, description, active, onToggle }) => (
    <div className="flex items-center justify-between pb-4 border-b border-gray-50 last:border-0 last:pb-0">
        <div className="pr-4">
            <h4 className="text-sm font-bold text-gray-900">{title}</h4>
            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">{description}</p>
        </div>
        <button
            onClick={onToggle}
            className={`relative flex-shrink-0 w-12 h-6 rounded-full transition-colors duration-200 ease-in-out ${active ? 'bg-[#019fcb]' : 'bg-gray-200'}`}
        >
            <span
                className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 ease-in-out shadow-sm ${active ? 'translate-x-6' : 'translate-x-0'}`}
            />
        </button>
    </div>
);

// ── Step 6: Members ──────────────────────────────────────────────
const StepMembers: React.FC<{
    count: number;
    members: any[];
    onChange: (members: any[]) => void;
    onImageUpload: (file: File, index: number) => Promise<void>;
}> = ({ count, members, onChange, onImageUpload }) => {
    
    // Ensure the array matches the count
    useEffect(() => {
        if (members.length < count) {
            const newArray = [...members];
            for (let i = members.length; i < count; i++) {
                newArray.push({ id: Date.now().toString() + i, name: '', description: '', image: '', isBoard: false, boardRole: '' });
            }
            onChange(newArray);
        } else if (members.length > count) {
            onChange(members.slice(0, count));
        }
    }, [count]);

    const fileRef = useRef<HTMLInputElement>(null);
    const [uploadIdx, setUploadIdx] = useState<number | null>(null);

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && uploadIdx !== null) await onImageUpload(file, uploadIdx);
        e.target.value = '';
    };

    const updateMember = (index: number, field: string, value: any) => {
        const newArray = [...members];
        newArray[index] = { ...newArray[index], [field]: value };
        onChange(newArray);
    };

    if (count <= 0) {
        return (
            <div className="max-w-3xl mx-auto text-center py-10">
                <p className="text-gray-500 font-bold">Ingresaste 0 en la cantidad de socios en el paso anterior. Puedes avanzar y agregarlos en el panel cuando quieras.</p>
            </div>
        );
    }

    return (
        <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-black text-gray-900 mb-2">👥 Directorio de Socios</h2>
            <p className="text-sm text-gray-400 mb-8">
                Completa la información de los {count} socios. Estos campos son <strong>opcionales</strong>, puedes completarlos más tarde desde el panel administrativo.
            </p>

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

            <div className="space-y-6">
                {members.slice(0, count).map((m, i) => (
                    <div key={m.id || i} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-5 relative group">
                        
                        {/* Indicador de Número */}
                        <div className="absolute top-4 right-4 bg-gray-100 text-gray-500 text-xs font-black px-2 py-1 rounded-lg">
                            Socio #{i + 1}
                        </div>

                        {/* Foto */}
                        <div className="flex-shrink-0 flex flex-col items-center gap-2">
                            <div 
                                onClick={() => { setUploadIdx(i); fileRef.current?.click(); }}
                                className="w-24 h-24 rounded-full border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center cursor-pointer hover:border-blue-400 overflow-hidden relative group transition-all"
                            >
                                {m.image ? (
                                    <>
                                        <img src={m.image} alt="" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/40 hidden group-hover:flex items-center justify-center">
                                            <Upload className="w-5 h-5 text-white" />
                                        </div>
                                    </>
                                ) : (
                                    <Camera className="w-6 h-6 text-gray-300" />
                                )}
                            </div>
                            <span className="text-[10px] text-gray-400 font-bold uppercase">Foto</span>
                        </div>
                        
                        {/* Info */}
                        <div className="flex-1 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Nombre Completo</label>
                                <input value={m.name} onChange={e => updateMember(i, 'name', e.target.value)} placeholder="Nombre del socio"
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Descripción corta (opcional)</label>
                                <textarea value={m.description} onChange={e => updateMember(i, 'description', e.target.value)} rows={2} placeholder="Breve descripción o profesión..."
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#019fcb]/20 focus:border-[#019fcb] transition-all resize-none" />
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-2 border-t border-gray-50">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <div className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${m.isBoard ? 'bg-[#019fcb]' : 'bg-gray-200'}`}
                                         onClick={() => updateMember(i, 'isBoard', !m.isBoard)}>
                                        <div className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform ${m.isBoard ? 'translate-x-5' : 'translate-x-0'}`} />
                                    </div>
                                    <span className="text-xs font-bold text-gray-600">¿Pertenece a la Junta Directiva?</span>
                                </label>
                                
                                {m.isBoard && (
                                    <div className="flex-1">
                                        <input value={m.boardRole} onChange={e => updateMember(i, 'boardRole', e.target.value)} placeholder="Cargo (Ej: Presidente)"
                                            className="w-full bg-blue-50 border border-blue-200 text-blue-800 rounded-xl px-4 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#019fcb]/30 font-bold placeholder-blue-300" />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};


// ── Step 7: Complete ─────────────────────────────────────────────
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
    const [modules, setModules] = useState({
        memberCount: 20,
        hasProjects: true,
        hasEvents: true,
        hasRotaract: false,
        hasInteract: false,
        hasEcommerce: false,
        hasDian: false,
        hasYouthExchange: false,
        hasNGSE: false,
        hasRotex: false
    });
    const [clubDocuments, setClubDocuments] = useState<any[]>([]);
    const [uploadingDoc, setUploadingDoc] = useState(false);

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

        // Load site images from ContentSection (same source as admin ImageDistribution)
        if (userClub.id) {
            fetch(`${API}/clubs/${userClub.id}/site-images?_t=${Date.now()}`)
                .then(r => r.ok ? r.json() : {})
                .then(data => {
                    if (data && Object.keys(data).length > 0) setSiteImages(data);
                })
                .catch(() => {});
        }

        // Load modules
        setModules({
            memberCount: parseInt(settingsMap['member_count']) || 20,
            hasProjects: settingsMap['module_projects'] !== 'false',
            hasEvents: settingsMap['module_events'] !== 'false',
            hasRotaract: settingsMap['module_rotaract'] === 'true',
            hasInteract: settingsMap['module_interact'] === 'true',
            hasEcommerce: settingsMap['module_ecommerce'] === 'true',
            hasDian: settingsMap['module_dian'] === 'true',
            hasYouthExchange: settingsMap['module_youth_exchange'] === 'true',
            hasNGSE: settingsMap['module_ngse'] === 'true',
            hasRotex: settingsMap['module_rotex'] === 'true'
        });

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

    // ── Club Documents (Knowledge Base) ──────────────────────
    const fetchDocuments = async () => {
        try {
            const res = await fetch(`${API}/documents`, { headers: { Authorization: `Bearer ${token}` } });
            if (res.ok) setClubDocuments(await res.json());
        } catch { /* silent */ }
    };

    useEffect(() => { if (token && userClub) fetchDocuments(); }, [token, userClub]);

    const handleDocUpload = async (files: FileList) => {
        setUploadingDoc(true);
        try {
            for (let i = 0; i < files.length; i++) {
                const fd = new FormData();
                fd.append('file', files[i]);
                const res = await fetch(`${API}/documents/upload`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: fd
                });
                if (res.ok) {
                    const doc = await res.json();
                    setClubDocuments(prev => [doc, ...prev]);
                }
            }
        } catch (err) { console.error('Doc upload error:', err); }
        setUploadingDoc(false);
    };

    const handleDocDelete = async (id: string) => {
        try {
            const res = await fetch(`${API}/documents/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) setClubDocuments(prev => prev.filter(d => d.id !== id));
        } catch (err) { console.error('Doc delete error:', err); }
    };

    const handleLogoUpload = async (file: File) => {
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await fetch(`${API}/media/upload-logo?folder=logos`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
            });
            const data = await res.json();
            const url = data.url || data.secure_url || '';
            if (url) setBranding(b => ({ ...b, logo: url }));
        } catch { /* ignore */ }
        setUploading(false);
    };

    const handleSiteImageUpload = async (key: string, file: File, index: number) => {
        setUploading(true);
        try {
            const url = await uploadFile(file);
            if (url) {
                setSiteImages((prev: any) => {
                    const newData = { ...prev };
                    const defaults = (SITE_IMG_DEFAULTS as any)[key] || [];
                    if (Array.isArray(defaults)) {
                        // Ensure we have a full array
                        const slots = Array.isArray(prev[key]) && prev[key].length === defaults.length
                            ? [...prev[key]]
                            : defaults.map((d: any, i: number) => (prev[key]?.[i] ? prev[key][i] : { ...d }));
                        const alt = file.name.replace(/\.[^/.]+$/, '');
                        slots[index] = { url, alt };
                        newData[key] = slots;
                    } else {
                        newData[key] = [{ url, alt: file.name.replace(/\.[^/.]+$/, '') }];
                    }
                    return newData;
                });
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
            // Saves to ContentSection (same as admin ImageDistribution)
            if (step === 4) {
                // Build normalized image data matching what the live site expects
                const imgPayload: any = {};
                for (const container of SITE_CONTAINERS) {
                    const subGroups = container.groups || [{ key: container.key, subLabel: '', count: container.count, aspect: container.aspect }];
                    for (const group of subGroups) {
                        const defaults = (SITE_IMG_DEFAULTS as any)[group.key] || [];
                        const saved = siteImages[group.key];
                        if (Array.isArray(defaults)) {
                            imgPayload[group.key] = Array.isArray(saved) && saved.length === defaults.length
                                ? saved
                                : defaults.map((d: any, i: number) => (saved?.[i] ? saved[i] : { ...d }));
                        } else {
                            imgPayload[group.key] = saved?.[0] || saved || { ...defaults };
                        }
                    }
                }
                await fetch(`${API}/admin/sections/batch-upsert`, {
                    method: 'POST', headers,
                    body: JSON.stringify({
                        clubId,
                        sections: [{ page: 'home', section: 'images', content: imgPayload }],
                    }),
                }).catch(() => {});
            }

            // ── Step 5: Modules ───────────────────────────────────────
            if (step === 5) {
                await fetch(`${API}/admin/clubs/${clubId}`, {
                    method: 'PUT', headers,
                    body: JSON.stringify({
                        memberCount: modules.memberCount,
                        moduleProjects: modules.hasProjects,
                        moduleEvents: modules.hasEvents,
                        moduleRotaract: modules.hasRotaract,
                        moduleInteract: modules.hasInteract,
                        moduleEcommerce: modules.hasEcommerce,
                        moduleDian: modules.hasDian,
                        moduleYouthExchange: modules.hasYouthExchange,
                        moduleNgse: modules.hasNGSE,
                        moduleRotex: modules.hasRotex
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
            const res = await fetch(`${API}/admin/clubs/${clubId}/complete-onboarding`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            if (!res.ok) throw new Error('Failed');
            // Update localStorage club data
            const stored = localStorage.getItem('rotary_club');
            if (stored) {
                const parsed = JSON.parse(stored);
                parsed.onboardingCompleted = true;
                parsed.status = 'active';
                localStorage.setItem('rotary_club', JSON.stringify(parsed));
            }
            // Small delay to ensure DB commit before reload
            await new Promise(r => setTimeout(r, 500));
            window.location.href = '/#/admin/dashboard';
            window.location.reload();
        } catch (err) {
            console.error('Finish error:', err);
        }
        setSaving(false);
    };

    const progress = Math.round((step / (STEPS.length - 1)) * 100);

    return (
        <div className="min-h-screen bg-rotary-concrete bg-gradient-to-br from-blue-50 to-white flex flex-col">
            {/* Top Bar */}
            {step > 0 && step < STEPS.length - 1 && (
                <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-lg border-b border-gray-200/60 shadow-sm">
                    <div className="max-w-3xl mx-auto flex items-center justify-between px-6 py-4">
                        <button onClick={handleBack} className="flex items-center gap-2 text-gray-400 hover:text-gray-700 text-sm font-bold transition-colors">
                            <ArrowLeft className="w-4 h-4" /> Atrás
                        </button>
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-[#0c3c7c]">Paso {step} de {STEPS.length - 2}</span>
                            <div className="w-32 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-[#0c3c7c] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    </div>
                </header>
            )}

            {/* Loading overlay */}
            {uploading && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
                    <div className="bg-white rounded-2xl p-6 shadow-2xl flex items-center gap-4">
                        <Loader2 className="w-6 h-6 animate-spin text-[#019fcb]" />
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
                            <Loader2 className="w-10 h-10 animate-spin text-[#019fcb] mb-4" />
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
                            {step === 1 && <StepClubInfo data={info} onChange={setInfo} documents={clubDocuments} onDocUpload={handleDocUpload} onDocDelete={handleDocDelete} uploadingDoc={uploadingDoc} />}
                            {step === 2 && <StepBranding data={branding} onChange={setBranding} onLogoUpload={handleLogoUpload} />}
                            {step === 3 && <StepSocial data={social} onChange={setSocial} />}
                            {step === 4 && <StepSiteImages data={siteImages} onChange={setSiteImages} onImageUpload={handleSiteImageUpload} />}
                            {step === 5 && <StepModules data={modules} onChange={setModules} />}
                            {step === 6 && <StepComplete clubName={info.name || 'tu club'} onFinish={handleFinish} saving={saving} />}
                        </>
                    )}
                </div>
            </main>

            {/* Bottom Navigation (not on welcome or complete) */}
            {step > 0 && step < STEPS.length - 1 && (
                <footer className="sticky bottom-0 bg-white/90 backdrop-blur-lg border-t border-gray-200/60 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
                    <div className="max-w-3xl mx-auto flex items-center justify-between px-6 py-4">
                        <button onClick={handleBack} className="flex items-center gap-2 text-gray-400 hover:text-gray-700 text-sm font-bold transition-colors">
                            <ArrowLeft className="w-4 h-4" /> Atrás
                        </button>
                        <div className="flex items-center gap-3">
                            {/* Step indicator dots */}
                            {STEPS.slice(1, -1).map((s, i) => (
                                <div key={s.id} className={`w-2 h-2 rounded-full transition-all ${i + 1 <= step ? 'bg-[#0c3c7c]' : 'bg-gray-200'}`} />
                            ))}
                        </div>
                        <button onClick={handleNext}
                            className="flex items-center gap-2 bg-[#019fcb] text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-[#017da3] transition-all shadow-lg shadow-blue-900/20">
                            {step === STEPS.length - 2 ? <>Activar Club 🚀</> : <>Siguiente <ArrowRight className="w-4 h-4" /></>}
                        </button>
                    </div>
                </footer>
            )}
        </div>
    );
};

export default OnboardingFlow;
