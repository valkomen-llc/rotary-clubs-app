import { useState, useEffect, useRef } from 'react';
import {
    Sparkles, ChevronRight, ChevronLeft, Palette, Building2,
    Share2, Layout, FolderKanban, Users, Rocket, Send,
    Loader2, CheckCircle, SkipForward, Bot, X, Upload, ImageIcon
} from 'lucide-react';
import { useClub } from '../../contexts/ClubContext';
import { useAuth } from '../../hooks/useAuth';

// ── Step Definitions ───────────────────────────────────────────────────────
const STEPS = [
    { id: 1, icon: Sparkles, label: 'Bienvenida', desc: 'Introducción a la plataforma' },
    { id: 2, icon: Palette, label: 'Identidad Visual', desc: 'Logo y colores del club' },
    { id: 3, icon: Building2, label: 'Información', desc: 'Datos de contacto y descripción' },
    { id: 4, icon: Share2, label: 'Redes Sociales', desc: 'Conecta tus perfiles' },
    { id: 5, icon: Layout, label: 'Contenido Web', desc: 'Hero, Sobre Nosotros, CTA' },
    { id: 6, icon: FolderKanban, label: 'Proyectos', desc: 'Tu primer proyecto' },
    { id: 7, icon: Users, label: 'Socios', desc: 'Directorio de miembros' },
    { id: 8, icon: Rocket, label: '¡Publicar!', desc: 'Revisión y publicación' },
];

const WELCOME_MESSAGES: Record<number, string> = {
    1: '¡Bienvenido a ClubPlatform! 🎉 Soy tu asistente de configuración. En los próximos pasos vas a dejar tu sitio web listo para el mundo. ¿Tienes alguna pregunta antes de empezar?',
    2: '¡Hola! Vamos a darle identidad visual a tu sitio. 🎨 Te ayudaré a subir el logo y elegir los colores institucionales. ¿Tienes listo el PNG del logo oficial de Rotary?',
    3: 'Ahora completemos la información de tu club. 📋 Una buena descripción ayuda a los visitantes a entender quiénes son. ¿Quieres que te sugiera un texto de ejemplo?',
    4: 'Conectar las redes sociales genera confianza en los visitantes. 📱 ¿Cuáles redes sociales usa actualmente el club?',
    5: 'El contenido del sitio es la carta de presentación. 🖊️ ¿Quieres que te sugiera un texto inspiracional para el banner principal basado en el nombre de tu club?',
    6: '¡Excelente! Los proyectos son el corazón de Rotary. 🌍 ¿Tienes un proyecto activo o reciente que puedas documentar aquí?',
    7: 'El directorio de socios es fundamental. 👥 Puedes importar un archivo CSV o agregar socios manualmente. ¿Cuántos socios tiene actualmente el club?',
    8: '🚀 ¡Felicidades! Has completado la configuración inicial de tu sitio. Tu club ya está listo para aparecer en línea. ¿Hay algo más en lo que pueda ayudarte?',
};

// ── Step Content Components ────────────────────────────────────────────────

const WelcomeStep = () => (
    <div className="flex flex-col items-center justify-center h-full text-center gap-8 py-12">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-rotary-blue to-blue-600 flex items-center justify-center shadow-2xl shadow-blue-200">
            <Sparkles className="w-12 h-12 text-white" />
        </div>
        <div>
            <h2 className="text-3xl font-black text-gray-900 mb-3">¡Bienvenido a ClubPlatform!</h2>
            <p className="text-gray-500 text-lg max-w-md">
                Vamos a configurar tu sitio web paso a paso. Solo tomará unos minutos y tendrás tu club en línea.
            </p>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full max-w-sm">
            {[
                { icon: '🎨', label: 'Personaliza tu marca' },
                { icon: '📝', label: 'Agrega contenido' },
                { icon: '👥', label: 'Gestiona socios' },
                { icon: '🚀', label: 'Publica en minutos' },
            ].map((item) => (
                <div key={item.label} className="bg-gray-50 rounded-2xl p-4 flex items-center gap-3 border border-gray-100">
                    <span className="text-2xl">{item.icon}</span>
                    <span className="text-sm font-bold text-gray-700">{item.label}</span>
                </div>
            ))}
        </div>
    </div>
);

const IdentityStep = ({ formData, setFormData, uploading, setUploading, club }: any) => {
    const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            // Client-side auto-crop (same as ClubSettings)
            const img = new Image();
            const url = URL.createObjectURL(file);
            const croppedBlob = await new Promise<Blob>((resolve) => {
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.width; canvas.height = img.height;
                    const ctx = canvas.getContext('2d')!;
                    ctx.drawImage(img, 0, 0);
                    URL.revokeObjectURL(url);
                    const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
                    let top = height, bottom = 0, left = width, right = 0;
                    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
                        const idx = (y * width + x) * 4;
                        if (data[idx + 3] > 10 && !(data[idx] > 225 && data[idx + 1] > 225 && data[idx + 2] > 225)) {
                            top = Math.min(top, y); bottom = Math.max(bottom, y);
                            left = Math.min(left, x); right = Math.max(right, x);
                        }
                    }
                    const pad = 4;
                    const cw = Math.min(width - 1, right + pad) - Math.max(0, left - pad) + 1;
                    const ch = Math.min(height - 1, bottom + pad) - Math.max(0, top - pad) + 1;
                    if (cw > 0 && ch > 0 && (cw < width || ch < height)) {
                        const c2 = document.createElement('canvas');
                        c2.width = cw; c2.height = ch;
                        c2.getContext('2d')!.drawImage(canvas, Math.max(0, left - pad), Math.max(0, top - pad), cw, ch, 0, 0, cw, ch);
                        c2.toBlob((b) => resolve(b || file), 'image/png');
                    } else canvas.toBlob((b) => resolve(b || file), 'image/png');
                };
                img.onerror = () => resolve(file);
                img.src = url;
            });
            const token = localStorage.getItem('rotary_token');
            const apiUrl = import.meta.env.VITE_API_URL || '/api';
            const fd = new FormData();
            fd.append('file', new File([croppedBlob], file.name.replace(/\.[^.]+$/, '.png'), { type: 'image/png' }));
            const resp = await fetch(`${apiUrl}/media/upload?folder=logos&clubId=${club.id}`.replace(/\/+/g, '/').replace(':/', '://'), {
                method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd
            });
            if (resp.ok) { const d = await resp.json(); setFormData((p: any) => ({ ...p, logo: d.url })); }
        } finally { setUploading(false); if (e.target) e.target.value = ''; }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="font-black text-gray-800 text-lg mb-1">Logo del Club</h3>
                <p className="text-sm text-gray-400">Sube el PNG oficial del generador de logos de Rotary. Los márgenes se eliminan automáticamente.</p>
            </div>
            <div className="flex items-center gap-6">
                <div className="w-32 h-32 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {formData.logo ? <img src={formData.logo} alt="Logo" className="w-full h-full object-contain p-2" /> : <ImageIcon className="w-10 h-10 text-gray-300" />}
                </div>
                <label className="cursor-pointer inline-flex items-center gap-2 bg-rotary-blue text-white px-5 py-3 rounded-xl font-bold hover:bg-rotary-blue/90 transition-colors">
                    <Upload className="w-4 h-4" />
                    {uploading ? 'Procesando...' : 'Seleccionar Logo'}
                    <input type="file" className="hidden" accept="image/*" onChange={handleLogoSelect} disabled={uploading} />
                </label>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Color Principal</label>
                    <div className="flex items-center gap-3">
                        <input type="color" value={formData.primaryColor} onChange={e => setFormData((p: any) => ({ ...p, primaryColor: e.target.value }))} className="w-10 h-10 rounded-lg cursor-pointer border-0" />
                        <span className="text-sm font-mono text-gray-600">{formData.primaryColor}</span>
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 mb-2 uppercase">Color Secundario</label>
                    <div className="flex items-center gap-3">
                        <input type="color" value={formData.secondaryColor} onChange={e => setFormData((p: any) => ({ ...p, secondaryColor: e.target.value }))} className="w-10 h-10 rounded-lg cursor-pointer border-0" />
                        <span className="text-sm font-mono text-gray-600">{formData.secondaryColor}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const InfoStep = ({ formData, setFormData }: any) => (
    <div className="space-y-4">
        <h3 className="font-black text-gray-800 text-lg">Información del Club</h3>
        <div>
            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Descripción</label>
            <textarea rows={3} value={formData.description} onChange={e => setFormData((p: any) => ({ ...p, description: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/20 resize-none"
                placeholder="Descripción breve del club..." />
        </div>
        <div className="grid grid-cols-2 gap-3">
            <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Email de Contacto</label>
                <input type="email" value={formData.email} onChange={e => setFormData((p: any) => ({ ...p, email: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/20" placeholder="contacto@club.org" />
            </div>
            <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Teléfono</label>
                <input type="tel" value={formData.phone} onChange={e => setFormData((p: any) => ({ ...p, phone: e.target.value }))}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/20" placeholder="+57 300 000 0000" />
            </div>
        </div>
        <div>
            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Dirección</label>
            <input type="text" value={formData.address} onChange={e => setFormData((p: any) => ({ ...p, address: e.target.value }))}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/20" placeholder="Ciudad, País" />
        </div>
    </div>
);

const SOCIAL_PLATFORMS = ['Facebook', 'Instagram', 'Twitter', 'LinkedIn', 'YouTube', 'WhatsApp'];
const SocialStep = ({ formData, setFormData }: any) => {
    const updateLink = (platform: string, url: string) => {
        const exists = formData.socialLinks.find((s: any) => s.platform === platform);
        if (exists) setFormData((p: any) => ({ ...p, socialLinks: p.socialLinks.map((s: any) => s.platform === platform ? { ...s, url } : s) }));
        else setFormData((p: any) => ({ ...p, socialLinks: [...p.socialLinks, { platform, url }] }));
    };
    const getLink = (platform: string) => formData.socialLinks.find((s: any) => s.platform === platform)?.url || '';
    return (
        <div className="space-y-4">
            <h3 className="font-black text-gray-800 text-lg">Redes Sociales</h3>
            <p className="text-sm text-gray-400">Agrega las URLs completas de tus perfiles. Puedes dejar en blanco las que no uses.</p>
            {SOCIAL_PLATFORMS.map(platform => (
                <div key={platform}>
                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">{platform}</label>
                    <input type="url" value={getLink(platform)} onChange={e => updateLink(platform, e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/20"
                        placeholder={`https://www.${platform.toLowerCase()}.com/tuclub`} />
                </div>
            ))}
        </div>
    );
};

const ContentStep = ({ formData, setFormData }: any) => (
    <div className="space-y-4">
        <h3 className="font-black text-gray-800 text-lg">Contenido del Sitio</h3>
        <p className="text-sm text-gray-400">Este contenido aparecerá en las secciones principales de tu sitio web.</p>
        {[
            { key: 'heroTitle', label: 'Título del Banner Principal', placeholder: 'Ej: Servicio, Liderazgo y Comunidad' },
            { key: 'heroSubtitle', label: 'Subtítulo del Banner', placeholder: 'Ej: Transformando vidas desde 1905' },
            { key: 'aboutText', label: 'Sobre Nosotros', placeholder: 'Breve descripción de la historia y misión del club...', multi: true },
            { key: 'ctaText', label: 'Texto del botón de acción', placeholder: 'Ej: Únete a Rotary' },
        ].map(field => (
            <div key={field.key}>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">{field.label}</label>
                {field.multi
                    ? <textarea rows={3} value={formData[field.key] || ''} onChange={e => setFormData((p: any) => ({ ...p, [field.key]: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/20 resize-none" placeholder={field.placeholder} />
                    : <input type="text" value={formData[field.key] || ''} onChange={e => setFormData((p: any) => ({ ...p, [field.key]: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/20" placeholder={field.placeholder} />
                }
            </div>
        ))}
    </div>
);

const ProjectStep = ({ formData, setFormData }: any) => (
    <div className="space-y-4">
        <h3 className="font-black text-gray-800 text-lg">Tu Primer Proyecto</h3>
        <p className="text-sm text-gray-400">Documenta un proyecto activo o reciente del club. Podrás agregar más desde el panel de Proyectos.</p>
        {[
            { key: 'projectName', label: 'Nombre del Proyecto', placeholder: 'Ej: Biblioteca Escolar Rural' },
            { key: 'projectArea', label: 'Área de Enfoque', placeholder: 'Ej: Educación, Salud, Agua...' },
            { key: 'projectDesc', label: 'Descripción breve', placeholder: '¿Qué hace el proyecto y a quién beneficia?', multi: true },
        ].map(field => (
            <div key={field.key}>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">{field.label}</label>
                {field.multi
                    ? <textarea rows={3} value={formData[field.key] || ''} onChange={e => setFormData((p: any) => ({ ...p, [field.key]: e.target.value }))}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/20 resize-none" placeholder={field.placeholder} />
                    : <input type="text" value={formData[field.key] || ''} onChange={e => setFormData((p: any) => ({ ...p, [field.key]: e.target.value }))}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/20" placeholder={field.placeholder} />
                }
            </div>
        ))}
    </div>
);

const MembersStep = ({ formData, setFormData }: any) => (
    <div className="space-y-5">
        <h3 className="font-black text-gray-800 text-lg">Directorio de Socios</h3>
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 space-y-3">
            <p className="text-sm font-bold text-rotary-blue">📄 Importar con CSV</p>
            <p className="text-sm text-gray-500">Crea un archivo CSV con columnas: <code className="bg-blue-100 px-1 rounded text-xs">nombre, email, cargo, telefono</code></p>
            <label className="inline-flex items-center gap-2 bg-rotary-blue text-white px-4 py-2 rounded-lg cursor-pointer font-bold text-sm hover:bg-rotary-blue/90 transition-colors">
                <Upload className="w-4 h-4" /> Importar CSV
                <input type="file" accept=".csv" className="hidden" onChange={e => setFormData((p: any) => ({ ...p, csvFile: e.target.files?.[0] }))} />
            </label>
            {formData.csvFile && <p className="text-xs text-green-600 font-bold">✅ {formData.csvFile.name} seleccionado</p>}
        </div>
        <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400 font-bold">O agrega manualmente</span></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
            {['memberName', 'memberEmail', 'memberRole', 'memberPhone'].map((key, i) => (
                <input key={key} type={i === 1 ? 'email' : 'text'} value={formData[key] || ''}
                    onChange={e => setFormData((p: any) => ({ ...p, [key]: e.target.value }))}
                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/20"
                    placeholder={['Nombre completo', 'Correo electrónico', 'Cargo en el club', 'Teléfono'][i]} />
            ))}
        </div>
        <p className="text-xs text-gray-400">💡 Podrás agregar más socios desde el panel <strong>Socios</strong> cuando quieras.</p>
    </div>
);

const PublishStep = ({ clubName }: { clubName: string }) => (
    <div className="flex flex-col items-center justify-center h-full text-center gap-8 py-8">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-2xl shadow-green-200 animate-bounce">
            <Rocket className="w-12 h-12 text-white" />
        </div>
        <div>
            <h2 className="text-3xl font-black text-gray-900 mb-3">¡{clubName} está listo!</h2>
            <p className="text-gray-500 text-lg max-w-md">Has completado la configuración inicial. Tu sitio ya está activo. Puedes seguir personalizándolo desde el panel de administración.</p>
        </div>
        <div className="grid grid-cols-3 gap-4">
            {[['📰', 'Agregar noticias'], ['📅', 'Crear eventos'], ['🛍️', 'Activar tienda']].map(([e, l]) => (
                <div key={l} className="bg-gray-50 rounded-2xl p-4 text-center border border-gray-100">
                    <div className="text-3xl mb-2">{e}</div>
                    <p className="text-xs font-bold text-gray-600">{l}</p>
                </div>
            ))}
        </div>
    </div>
);

// ── AI Chat Panel ──────────────────────────────────────────────────────────
const AIChatPanel = ({ step, token, agentName }: { step: number; token: string | null; agentName: string }) => {
    const [messages, setMessages] = useState<{ role: 'user' | 'agent'; text: string }[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const apiUrl = import.meta.env.VITE_API_URL || '/api';

    // Auto-welcome when step changes
    useEffect(() => {
        setMessages([{ role: 'agent', text: WELCOME_MESSAGES[step] || '¡Hola! ¿En qué puedo ayudarte con este paso?' }]);
        setInput('');
    }, [step]);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const send = async () => {
        const text = input.trim();
        if (!text || loading) return;
        setMessages(prev => [...prev, { role: 'user', text }]);
        setInput('');
        setLoading(true);
        try {
            const resp = await fetch(`${apiUrl}/ai/onboarding-chat`.replace(/\/+/g, '/').replace(':/', '://'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ message: text, step })
            });
            const data = await resp.json();
            setMessages(prev => [...prev, { role: 'agent', text: data.reply || 'No pude generar una respuesta.' }]);
        } catch {
            setMessages(prev => [...prev, { role: 'agent', text: 'Tuve un problema al conectarme. Por favor intenta de nuevo.' }]);
        } finally { setLoading(false); }
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 rounded-2xl border border-gray-100">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-100 bg-white rounded-t-2xl flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-rotary-blue to-blue-600 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                </div>
                <div>
                    <p className="text-xs font-black text-gray-800">{agentName}</p>
                    <p className="text-[10px] text-emerald-500 font-bold flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" /> Agente IA activo</p>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[340px]">
                {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-rotary-blue text-white rounded-br-sm' : 'bg-white text-gray-700 border border-gray-100 rounded-bl-sm shadow-sm'}`}>
                            {msg.text}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 shadow-sm">
                            <Loader2 className="w-3 h-3 animate-spin text-rotary-blue" />
                            <span className="text-xs text-gray-400">Escribiendo...</span>
                        </div>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-gray-100 bg-white rounded-b-2xl">
                <div className="flex gap-2">
                    <input
                        type="text" value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && send()}
                        placeholder="Escribe tu pregunta..."
                        className="flex-1 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rotary-blue/20"
                    />
                    <button onClick={send} disabled={loading || !input.trim()}
                        className="w-9 h-9 bg-rotary-blue text-white rounded-xl flex items-center justify-center hover:bg-rotary-blue/90 transition-colors disabled:opacity-40">
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main Wizard ──────────────────────────────────────────────────────────────
const OnboardingWizard = ({ onDismiss }: { onDismiss: () => void }) => {
    const { club } = useClub();
    const { token } = useAuth();
    const [currentStep, setCurrentStep] = useState(club?.onboardingStep || 1);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [formData, setFormData] = useState<Record<string, any>>({
        logo: club?.logo || '',
        primaryColor: club?.colors?.primary || '#013388',
        secondaryColor: club?.colors?.secondary || '#E29C00',
        description: club?.description || '',
        email: club?.contact?.email || '',
        phone: club?.contact?.phone || '',
        address: club?.contact?.address || '',
        socialLinks: club?.social || [],
        heroTitle: '', heroSubtitle: '', aboutText: '', ctaText: '',
        projectName: '', projectArea: '', projectDesc: '',
        memberName: '', memberEmail: '', memberRole: '', memberPhone: '',
        csvFile: null,
    });

    const apiUrl = (import.meta.env.VITE_API_URL || '/api');
    const currentStepDef = STEPS.find(s => s.id === currentStep)!;

    const saveProgress = async (step: number, completed = false) => {
        try {
            await fetch(`${apiUrl}/ai/onboarding`.replace(/\/+/g, '/').replace(':/', '://'), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ step, completed })
            });
        } catch (_) { }
    };

    const handleNext = async () => {
        if (currentStep === 8) {
            setSaving(true);
            // Mark onboarding complete
            await saveProgress(8, true);
            // Publish the club site
            if (club?.id) {
                try {
                    await fetch(`${apiUrl}/admin/clubs/${club.id}/publish`.replace(/\/+/g, '/').replace(':/', '://'), {
                        method: 'PATCH',
                        headers: { Authorization: `Bearer ${token}` },
                    });

                    // ── Trigger Orchestrator Background Task ──
                    fetch(`${apiUrl}/agents/orchestrate`.replace(/\/+/g, '/').replace(':/', '://'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            clubId: club.id,
                            type: 'onboarding_complete',
                            payload: { clubName: club.name || 'El Club', step: 8 }
                        })
                    }).catch(err => console.error('[Orchestration] Dispatch failed:', err));

                } catch (_) { }
            }
            setSaving(false);
            onDismiss();
            return;
        }
        await saveProgress(currentStep + 1);
        setCurrentStep(s => s + 1);
    };

    const handleBack = () => setCurrentStep(s => Math.max(1, s - 1));

    const handleSkip = async () => {
        await saveProgress(currentStep + 1);
        setCurrentStep(s => s + 1);
    };

    const handleExitToPanel = async () => {
        await saveProgress(currentStep);
        onDismiss();
    };

    const stepContent: Record<number, React.ReactElement> = {
        1: <WelcomeStep />,
        2: <IdentityStep formData={formData} setFormData={setFormData} uploading={uploading} setUploading={setUploading} club={club} />,
        3: <InfoStep formData={formData} setFormData={setFormData} />,
        4: <SocialStep formData={formData} setFormData={setFormData} />,
        5: <ContentStep formData={formData} setFormData={setFormData} />,
        6: <ProjectStep formData={formData} setFormData={setFormData} />,
        7: <MembersStep formData={formData} setFormData={setFormData} />,
        8: <PublishStep clubName={club?.name || 'Tu Club'} />,
    };

    return (
        <div className="fixed inset-0 z-[200] bg-gray-950/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">

                {/* Top bar */}
                <div className="px-8 pt-6 pb-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-rotary-blue flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <h1 className="font-black text-gray-900 text-sm">Configuración inicial</h1>
                            <p className="text-[11px] text-gray-400">Paso {currentStep} de {STEPS.length} — {currentStepDef.label}</p>
                        </div>
                    </div>
                    <button onClick={handleExitToPanel} className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors px-3 py-2 rounded-lg hover:bg-gray-50">
                        <X className="w-4 h-4" /> Configurar después
                    </button>
                </div>

                {/* Step progress pills */}
                <div className="px-8 py-3 border-b border-gray-50 flex gap-2 overflow-x-auto scrollbar-hide flex-shrink-0">
                    {STEPS.map(step => {
                        const Icon = step.icon;
                        const isActive = step.id === currentStep;
                        const isDone = step.id < currentStep;
                        return (
                            <button key={step.id} onClick={() => step.id < currentStep ? setCurrentStep(step.id) : undefined}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all flex-shrink-0 ${isActive ? 'bg-rotary-blue text-white shadow-lg shadow-rotary-blue/20' : isDone ? 'bg-emerald-50 text-emerald-600 cursor-pointer hover:bg-emerald-100' : 'bg-gray-50 text-gray-400'}`}>
                                {isDone ? <CheckCircle className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                                {step.label}
                            </button>
                        );
                    })}
                </div>

                {/* Main content + AI chat */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Left: Step content */}
                    <div className="flex-1 overflow-y-auto px-8 py-6 min-w-0">
                        {stepContent[currentStep]}
                    </div>

                    {/* Right: AI Chat panel */}
                    <div className="w-80 flex-shrink-0 p-4 border-l border-gray-50 flex flex-col">
                        <AIChatPanel step={currentStep} token={token} agentName={currentStepDef.label} />
                    </div>
                </div>

                {/* Bottom navigation */}
                <div className="px-8 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0 bg-white">
                    <button onClick={handleBack} disabled={currentStep === 1}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                        <ChevronLeft className="w-4 h-4" /> Anterior
                    </button>

                    <div className="flex items-center gap-3">
                        {currentStep < 8 && (
                            <button onClick={handleSkip} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors font-bold px-3 py-2 rounded-xl hover:bg-gray-50">
                                <SkipForward className="w-3.5 h-3.5" /> Omitir paso
                            </button>
                        )}
                        <button onClick={handleNext} disabled={saving}
                            className="flex items-center gap-2 px-6 py-2.5 bg-rotary-blue text-white rounded-xl font-bold text-sm hover:bg-rotary-blue/90 transition-colors disabled:opacity-60 shadow-lg shadow-rotary-blue/20">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : currentStep === 8 ? <><Rocket className="w-4 h-4" /> ¡Ir al Panel!</> : <>Continuar <ChevronRight className="w-4 h-4" /></>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default OnboardingWizard;
