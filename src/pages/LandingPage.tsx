import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Sparkles, Globe, Users, Palette, Bot,
    FolderKanban, Calendar, Store, CheckCircle,
    ArrowRight, Zap, Shield, Smartphone, ChevronRight,
    BarChart3, MessageCircle, Play, Star, ArrowUpRight,
    Layers, Lock, Clock, Heart
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════
   Brand tokens – conserved from the project identity
   ═══════════════════════════════════════════════════════════ */
const BRAND = {
    blue: '#013388',
    gold: '#E29C00',
    dark: '#0a1628',
};

/* ═══════════════════════════════════════════════════════════
   Data constants
   ═══════════════════════════════════════════════════════════ */
const FEATURES = [
    { icon: Bot, title: 'Asistentes IA por Sección', desc: 'Cada módulo tiene un agente IA que guía al admin paso a paso en la configuración.', color: 'from-blue-500 to-indigo-600' },
    { icon: Palette, title: 'Identidad Visual Automática', desc: 'Sube el logo, elige colores y obtén un sitio con la marca oficial Rotary al instante.', color: 'from-violet-500 to-purple-600' },
    { icon: Globe, title: 'Dominio Propio .org', desc: 'Obtén rotaryclubciudad.org o usa tuclub.clubplatform.org durante la configuración.', color: 'from-emerald-500 to-teal-600' },
    { icon: FolderKanban, title: 'Gestión de Proyectos', desc: 'Documenta proyectos de servicio con fotos, estados y beneficiarios en tiempo real.', color: 'from-amber-500 to-orange-600' },
    { icon: Users, title: 'Directorio de Socios', desc: 'Gestiona el directorio completo y la junta directiva con perfil individual de cada socio.', color: 'from-pink-500 to-rose-600' },
    { icon: Calendar, title: 'Eventos y Calendario', desc: 'Programa reuniones, eventos especiales e integra todo con el calendario público del club.', color: 'from-sky-500 to-blue-600' },
    { icon: Store, title: 'Tienda del Club', desc: 'E-commerce integrado para artículos rotarios con pasarela de pagos personalizada.', color: 'from-lime-500 to-green-600' },
    { icon: BarChart3, title: 'Estados Financieros', desc: 'Publica y gestiona los informes financieros del club con transparencia total.', color: 'from-gray-500 to-slate-600' },
];

const STEPS = [
    { n: '01', title: 'Regístrate gratis', desc: 'Crea la cuenta de tu club en menos de 2 minutos. Solo necesitas el nombre, país y un correo.', icon: Zap },
    { n: '02', title: 'Configura con IA', desc: 'Un wizard de 6 pasos guiado por IA te ayuda a personalizar cada sección del sitio.', icon: Bot },
    { n: '03', title: 'Publica y comparte', desc: 'Tu sitio queda activo con subdominio provisional. Conecta tu dominio .org cuando estés listo.', icon: Globe },
];

const TESTIMONIALS = [
    { club: 'Rotary Club Bogotá Usaquén', quote: 'En 10 minutos teníamos nuestro sitio profesional funcionando. El asistente IA hizo todo más fácil.', author: 'Presidente 2024-2025', avatar: 'BU' },
    { club: 'Rotary Buenaventura Pacífico', quote: 'La primera plataforma que realmente entiende cómo funciona Rotary. Cada módulo tiene sentido.', author: 'Comité de Imagen Pública', avatar: 'BP' },
    { club: 'Rotary Armenia Internacional', quote: 'Pasamos de no tener presencia digital a tener un sitio web completo con dominio .org en un día.', author: 'Secretario del Club', avatar: 'AI' },
];

const STATS = [
    { value: '5', suffix: 'min', label: 'Tiempo de setup' },
    { value: '100', suffix: '%', label: 'Hecho para Rotary' },
    { value: '0', suffix: '$', label: 'Para empezar' },
    { value: '24', suffix: '/7', label: 'Soporte IA' },
];

/* ═══════════════════════════════════════════════════════════
   Animated counter hook
   ═══════════════════════════════════════════════════════════ */
function useCountUp(target: number, duration = 2000) {
    const [count, setCount] = useState(0);
    const ref = useRef<HTMLDivElement>(null);
    const [started, setStarted] = useState(false);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting && !started) setStarted(true); },
            { threshold: 0.3 }
        );
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [started]);

    useEffect(() => {
        if (!started) return;
        const step = Math.ceil(target / (duration / 16));
        let current = 0;
        const timer = setInterval(() => {
            current += step;
            if (current >= target) { setCount(target); clearInterval(timer); }
            else setCount(current);
        }, 16);
        return () => clearInterval(timer);
    }, [started, target, duration]);

    return { count, ref };
}

/* ═══════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════ */
export default function LandingPage() {
    const navigate = useNavigate();
    const [scrolled, setScrolled] = useState(false);
    const [activeFeature, setActiveFeature] = useState(0);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    // Auto-rotate features
    useEffect(() => {
        const timer = setInterval(() => setActiveFeature(p => (p + 1) % FEATURES.length), 4000);
        return () => clearInterval(timer);
    }, []);

    const goRegister = () => navigate('/registro');

    return (
        <div className="min-h-screen bg-white font-sans overflow-x-hidden">
            {/* ═════════════ NAV ═════════════ */}
            <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled ? 'bg-white/95 backdrop-blur-xl shadow-lg shadow-black/[.03]' : 'bg-transparent'}`}>
                <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-[#013388] flex items-center justify-center shadow-lg shadow-blue-900/20">
                            <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-black text-gray-900 text-lg tracking-tight">ClubPlatform</span>
                    </div>
                    <div className="flex items-center gap-6">
                        <a href="#features" className="hidden md:block text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">Características</a>
                        <a href="#como-funciona" className="hidden md:block text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">Cómo funciona</a>
                        <a href="#testimonios" className="hidden md:block text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">Testimonios</a>
                        <button
                            onClick={goRegister}
                            className="group bg-[#013388] text-white text-sm font-bold px-5 py-2.5 rounded-xl hover:bg-[#013388]/90 transition-all shadow-lg shadow-blue-900/20 flex items-center gap-2"
                        >
                            Crear mi sitio
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                    </div>
                </div>
            </nav>

            {/* ═════════════ HERO ═════════════ */}
            <section className="relative pt-28 pb-20 md:pt-36 md:pb-28 px-6 overflow-hidden">
                {/* Background elements */}
                <div className="absolute inset-0 bg-gradient-to-b from-blue-50/80 via-white to-white" />
                <div className="absolute top-20 left-1/4 w-96 h-96 bg-blue-100/40 rounded-full blur-3xl" />
                <div className="absolute top-40 right-1/4 w-80 h-80 bg-amber-100/30 rounded-full blur-3xl" />
                <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-white to-transparent" />

                <div className="relative max-w-7xl mx-auto">
                    <div className="grid md:grid-cols-2 gap-12 items-center">
                        {/* Left: Copy */}
                        <div>
                            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/50 text-[#013388] text-xs font-bold px-4 py-2 rounded-full mb-6 shadow-sm">
                                <Zap className="w-3.5 h-3.5" />
                                Plataforma SaaS para clubes Rotary
                            </div>
                            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 leading-[1.1] tracking-tight mb-6">
                                Digitaliza tu{' '}
                                <span className="relative inline-block">
                                    <span className="relative z-10 text-[#013388]">Club Rotario</span>
                                    <span className="absolute bottom-1 left-0 right-0 h-3 bg-[#E29C00]/20 rounded-full -z-0" />
                                </span>
                                <br />en minutos.
                            </h1>
                            <p className="text-lg text-gray-500 leading-relaxed mb-8 max-w-lg">
                                La primera plataforma creada exclusivamente para Rotary. 
                                Sitio web profesional, gestión de proyectos, directorio de socios y 
                                tienda virtual — todo asistido por <strong className="text-gray-700">inteligencia artificial</strong>.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3 mb-8">
                                <button
                                    onClick={goRegister}
                                    className="group flex items-center justify-center gap-2.5 bg-[#013388] text-white font-bold px-7 py-4 rounded-2xl hover:bg-[#012266] transition-all shadow-xl shadow-blue-900/20 text-base"
                                >
                                    Crear mi sitio gratis
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </button>
                                <a
                                    href="https://rotaryarmeniainternacional.org"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="group flex items-center justify-center gap-2 border-2 border-gray-200 text-gray-700 font-bold px-7 py-4 rounded-2xl hover:border-gray-300 hover:bg-gray-50 transition-all text-base"
                                >
                                    <Play className="w-4 h-4" />
                                    Ver ejemplo en vivo
                                </a>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-400">
                                <span className="flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Sin tarjeta de crédito</span>
                                <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> Setup en 5 min</span>
                                <span className="flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> HTTPS incluido</span>
                            </div>
                        </div>

                        {/* Right: Browser Mockup */}
                        <div className="relative">
                            <div className="absolute -inset-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-[2rem] blur-2xl" />
                            <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200/60 overflow-hidden">
                                {/* Browser chrome */}
                                <div className="flex items-center gap-2 px-5 py-3.5 bg-gray-50 border-b border-gray-100">
                                    <div className="flex gap-1.5">
                                        <div className="w-3 h-3 rounded-full bg-red-400" />
                                        <div className="w-3 h-3 rounded-full bg-yellow-400" />
                                        <div className="w-3 h-3 rounded-full bg-green-400" />
                                    </div>
                                    <div className="flex-1 mx-4">
                                        <div className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
                                            <Lock className="w-3 h-3 text-emerald-500" />
                                            <span className="text-xs text-gray-500 font-mono">miclub.clubplatform.org</span>
                                        </div>
                                    </div>
                                </div>
                                {/* Dashboard Preview */}
                                <div className="p-5">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-10 h-10 rounded-xl bg-[#013388] flex items-center justify-center">
                                            <span className="text-white font-black text-sm">RC</span>
                                        </div>
                                        <div>
                                            <div className="text-sm font-black text-gray-900">Rotary Club Ejemplo</div>
                                            <div className="text-[11px] text-gray-400 font-medium">Distrito 4271 · Colombia</div>
                                        </div>
                                        <div className="ml-auto flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            <span className="text-[10px] font-bold text-emerald-700">En línea</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2.5 mb-4">
                                        {[
                                            { label: 'Socios', value: '42', color: BRAND.blue },
                                            { label: 'Proyectos', value: '8', color: BRAND.gold },
                                            { label: 'Eventos', value: '12', color: '#10b981' },
                                        ].map(s => (
                                            <div key={s.label} className="rounded-xl border border-gray-100 p-3 bg-gray-50/50">
                                                <div className="text-xl font-black" style={{ color: s.color }}>{s.value}</div>
                                                <div className="text-[11px] text-gray-400 font-medium mt-0.5">{s.label}</div>
                                            </div>
                                        ))}
                                    </div>
                                    <div className="rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/50 p-3.5 flex items-start gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[#013388] flex items-center justify-center flex-shrink-0">
                                            <Bot className="w-4 h-4 text-white" />
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-bold text-[#013388]">Agente IA — Configuración</p>
                                            <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">¡Perfecto! Tu sitio está 85% completo. Solo falta agregar el logo oficial y un proyecto.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* Floating badges */}
                            <div className="absolute -left-6 top-1/4 bg-white rounded-xl shadow-xl border border-gray-100 p-3 flex items-center gap-2.5 animate-[float_3s_ease-in-out_infinite]">
                                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                                </div>
                                <div>
                                    <div className="text-[10px] font-black text-gray-900">Dominio activo</div>
                                    <div className="text-[9px] text-gray-400">rotaryclub.org</div>
                                </div>
                            </div>
                            <div className="absolute -right-4 bottom-1/4 bg-white rounded-xl shadow-xl border border-gray-100 p-3 flex items-center gap-2.5 animate-[float_3s_ease-in-out_infinite_1.5s]">
                                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                                    <Star className="w-4 h-4 text-amber-500" />
                                </div>
                                <div>
                                    <div className="text-[10px] font-black text-gray-900">Setup completo</div>
                                    <div className="text-[9px] text-gray-400">100% configurado</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats Bar */}
                    <div className="mt-20 bg-white rounded-2xl border border-gray-100 shadow-lg p-2">
                        <div className="grid grid-cols-2 md:grid-cols-4">
                            {STATS.map((stat, i) => {
                                const { count, ref } = useCountUp(parseInt(stat.value), 1500);
                                return (
                                    <div key={i} ref={ref} className={`text-center py-5 px-4 ${i < STATS.length - 1 ? 'md:border-r border-gray-100' : ''}`}>
                                        <div className="text-3xl font-black text-gray-900">
                                            {count}{stat.suffix}
                                        </div>
                                        <div className="text-xs text-gray-400 font-medium mt-1">{stat.label}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </section>

            {/* ═════════════ CÓMO FUNCIONA ═════════════ */}
            <section id="como-funciona" className="py-24 px-6 bg-white">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold px-4 py-2 rounded-full mb-4">
                            <Layers className="w-3.5 h-3.5" />
                            Simple y rápido
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-4">
                            Tres pasos. Cero complicaciones.
                        </h2>
                        <p className="text-gray-500 text-lg max-w-2xl mx-auto">Sin conocimientos técnicos. Sin agencias. Solo tú y tu asistente inteligente.</p>
                    </div>
                    <div className="grid md:grid-cols-3 gap-8">
                        {STEPS.map((step, i) => {
                            const Icon = step.icon;
                            return (
                                <div key={step.n} className="relative group">
                                    {/* Connector line */}
                                    {i < STEPS.length - 1 && (
                                        <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-gray-200 to-transparent" />
                                    )}
                                    <div className="bg-white rounded-2xl border border-gray-100 p-8 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative">
                                        <div className="flex items-center gap-4 mb-5">
                                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#013388] to-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/20">
                                                <Icon className="w-5 h-5 text-white" />
                                            </div>
                                            <span className="text-5xl font-black text-gray-100">{step.n}</span>
                                        </div>
                                        <h3 className="text-xl font-black text-gray-900 mb-3">{step.title}</h3>
                                        <p className="text-gray-500 leading-relaxed">{step.desc}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="text-center mt-12">
                        <button
                            onClick={goRegister}
                            className="group inline-flex items-center gap-2 bg-[#013388] text-white font-bold px-8 py-4 rounded-2xl hover:bg-[#012266] transition-all shadow-xl shadow-blue-900/20"
                        >
                            Comenzar ahora — es gratis
                            <ChevronRight className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                    </div>
                </div>
            </section>

            {/* ═════════════ FEATURES ═════════════ */}
            <section id="features" className="py-24 px-6 bg-gradient-to-b from-gray-50 to-white">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="inline-flex items-center gap-2 bg-violet-50 border border-violet-100 text-violet-700 text-xs font-bold px-4 py-2 rounded-full mb-4">
                            <Sparkles className="w-3.5 h-3.5" />
                            Todo incluido
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-4">
                            Todo lo que tu club necesita
                        </h2>
                        <p className="text-gray-500 text-lg max-w-2xl mx-auto">Una plataforma completa, construida específicamente para la realidad de los clubes Rotary.</p>
                    </div>

                    {/* Feature Grid */}
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {FEATURES.map((feat, i) => {
                            const Icon = feat.icon;
                            return (
                                <div
                                    key={feat.title}
                                    onMouseEnter={() => setActiveFeature(i)}
                                    className={`rounded-2xl p-6 border cursor-pointer transition-all duration-500 ${
                                        activeFeature === i
                                            ? 'bg-white border-gray-200 shadow-xl -translate-y-1 scale-[1.02]'
                                            : 'bg-white/50 border-gray-100 hover:bg-white hover:border-gray-200'
                                    }`}
                                >
                                    <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${feat.color} flex items-center justify-center mb-4 shadow-lg transition-transform duration-300 ${activeFeature === i ? 'scale-110' : ''}`}>
                                        <Icon className="w-5 h-5 text-white" />
                                    </div>
                                    <h3 className="font-black text-gray-900 mb-2 text-sm">{feat.title}</h3>
                                    <p className="text-xs text-gray-500 leading-relaxed">{feat.desc}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* ═════════════ TESTIMONIALS ═════════════ */}
            <section id="testimonios" className="py-24 px-6 bg-white">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-100 text-amber-700 text-xs font-bold px-4 py-2 rounded-full mb-4">
                            <Heart className="w-3.5 h-3.5" />
                            Historias reales
                        </div>
                        <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-4">
                            Clubes que ya confían
                        </h2>
                        <p className="text-gray-500 text-lg">Y creciendo cada semana con nuevos clubes de toda América Latina.</p>
                    </div>
                    <div className="grid md:grid-cols-3 gap-6">
                        {TESTIMONIALS.map((t, i) => (
                            <div key={i} className="bg-gradient-to-b from-gray-50 to-white rounded-2xl border border-gray-100 p-7 hover:shadow-lg transition-all duration-300 flex flex-col">
                                <div className="flex items-center gap-1 mb-5">
                                    {[...Array(5)].map((_, j) => (
                                        <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />
                                    ))}
                                </div>
                                <p className="text-gray-600 leading-relaxed mb-6 flex-1 italic">"{t.quote}"</p>
                                <div className="flex items-center gap-3 pt-5 border-t border-gray-100">
                                    <div className="w-10 h-10 rounded-full bg-[#013388] flex items-center justify-center text-white font-black text-xs">
                                        {t.avatar}
                                    </div>
                                    <div>
                                        <div className="text-sm font-black text-gray-900">{t.club}</div>
                                        <div className="text-xs text-gray-400">{t.author}</div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═════════════ CTA FINAL ═════════════ */}
            <section className="py-24 px-6 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-[#0a1628] via-[#013388] to-[#012266]" />
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
                
                <div className="relative max-w-4xl mx-auto text-center">
                    <div className="w-20 h-20 rounded-3xl bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-8 border border-white/10">
                        <Sparkles className="w-10 h-10 text-white" />
                    </div>
                    <h2 className="text-4xl md:text-5xl font-black text-white mb-5 leading-tight">
                        Tu club merece<br />estar en línea.
                    </h2>
                    <p className="text-blue-200 text-lg mb-10 max-w-xl mx-auto">
                        Únete a la plataforma que está digitalizando Rotary en América Latina. 
                        Empieza gratis y publica cuando estés listo.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <button
                            onClick={goRegister}
                            className="group flex items-center justify-center gap-2 bg-white text-[#013388] font-black px-8 py-4 rounded-2xl hover:bg-gray-50 transition-all text-base shadow-2xl"
                        >
                            Crear el sitio de mi club
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </button>
                        <a
                            href="mailto:soporte@clubplatform.org"
                            className="flex items-center justify-center gap-2 border-2 border-white/20 text-white font-bold px-8 py-4 rounded-2xl hover:bg-white/10 transition-all text-base"
                        >
                            <MessageCircle className="w-4 h-4" />
                            Hablar con ventas
                        </a>
                    </div>
                    <p className="text-blue-300/50 text-xs mt-8">
                        Sin tarjeta de crédito · Sin compromiso · Cancela cuando quieras
                    </p>
                </div>
            </section>

            {/* ═════════════ FOOTER ═════════════ */}
            <footer className="py-10 px-6 bg-white border-t border-gray-100">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-[#013388] flex items-center justify-center shadow-sm">
                            <Sparkles className="w-3.5 h-3.5 text-white" />
                        </div>
                        <span className="font-black text-gray-900 text-sm">ClubPlatform</span>
                    </div>
                    <p className="text-[11px] text-gray-400">© {new Date().getFullYear()} ClubPlatform — Plataforma digital para clubes Rotary · Por <strong>Valkomen LLC</strong></p>
                    <div className="flex items-center gap-5">
                        <a href="mailto:soporte@clubplatform.org" className="text-xs text-gray-400 hover:text-gray-600 transition-colors font-medium">Soporte</a>
                        <a href="#" className="text-xs text-gray-400 hover:text-gray-600 transition-colors font-medium">Términos</a>
                        <a href="#" className="text-xs text-gray-400 hover:text-gray-600 transition-colors font-medium">Privacidad</a>
                    </div>
                </div>
            </footer>

            {/* ═════════════ CSS ANIMATIONS ═════════════ */}
            <style>{`
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-8px); }
                }
            `}</style>
        </div>
    );
}
