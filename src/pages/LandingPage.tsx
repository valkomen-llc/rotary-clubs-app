import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Sparkles, Globe, Users, LayoutDashboard, Palette, Bot,
    FolderKanban, Calendar, Store, ChevronRight, CheckCircle,
    ArrowRight, Zap, Shield, Smartphone
} from 'lucide-react';

const FEATURES = [
    { icon: Bot, title: 'Agentes IA por Sección', desc: 'Cada parte del setup tiene un asistente IA que guía al admin paso a paso.' },
    { icon: Palette, title: 'Identidad Visual Automática', desc: 'Sube tu logo y los márgenes se eliminan automáticamente. Elige colores en segundos.' },
    { icon: Globe, title: 'Subdominio Propio', desc: 'Tu club obtiene tuclub.clubplatform.org listo para compartir al instante.' },
    { icon: FolderKanban, title: 'Gestión de Proyectos', desc: 'Documenta y publica los proyectos de servicio del club con fotos, estados y beneficiarios.' },
    { icon: Users, title: 'Directorio de Socios', desc: 'Importa tu directorio con CSV o gestiona socios uno a uno desde el panel.' },
    { icon: Calendar, title: 'Eventos e Informes', desc: 'Calendario de reuniones, eventos especiales y estados financieros publicables.' },
    { icon: Store, title: 'Tienda del Club', desc: 'Activa una tienda para vender artículos rotarios con pagos integrados.' },
    { icon: Smartphone, title: 'Diseño Responsivo', desc: 'Tu sitio se ve perfecto en móvil, tablet y escritorio sin configuración extra.' },
];

const STEPS = [
    { n: '01', title: 'Regístrate gratis', desc: 'Crea la cuenta del club en menos de 2 minutos. Solo necesitas el nombre, país y un correo.' },
    { n: '02', title: 'Configura con IA', desc: 'Un asistente guiado por IA te ayuda a personalizar cada sección de tu sitio.' },
    { n: '03', title: 'Publica y comparte', desc: 'Tu sitio queda activo en tuclub.clubplatform.org listo para el mundo.' },
];

const CLUBS = [
    'Rotary Club Bogotá Usaquén',
    'Rotary Buenaventura Pacífico',
    'Rotary Armenia Internacional',
];

export default function LandingPage() {
    const navigate = useNavigate();
    const [scrolled, setScrolled] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return (
        <div className="min-h-screen bg-white font-sans">
            {/* NAV */}
            <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-md shadow-sm' : 'bg-transparent'}`}>
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-[#013388] flex items-center justify-center">
                            <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <span className="font-black text-gray-900 text-lg tracking-tight">ClubPlatform</span>
                    </div>
                    <div className="flex items-center gap-4">
                        <a href="#features" className="hidden md:block text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">Características</a>
                        <a href="#como-funciona" className="hidden md:block text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">Cómo funciona</a>
                        <button
                            onClick={() => navigate('/#/registro')}
                            className="bg-[#013388] text-white text-sm font-bold px-5 py-2 rounded-xl hover:bg-[#013388]/90 transition-colors"
                        >
                            Crear mi sitio
                        </button>
                    </div>
                </div>
            </nav>

            {/* HERO */}
            <section className="pt-32 pb-24 px-6 bg-gradient-to-b from-blue-50/60 to-white">
                <div className="max-w-4xl mx-auto text-center">
                    <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-[#013388] text-xs font-bold px-4 py-2 rounded-full mb-8">
                        <Zap className="w-3.5 h-3.5" />
                        Sitio web listo en 5 minutos — con agentes IA
                    </div>
                    <h1 className="text-5xl md:text-6xl font-black text-gray-900 leading-tight tracking-tight mb-6">
                        El sitio web de tu<br />
                        <span className="text-[#013388]">Club Rotario</span><br />
                        en minutos.
                    </h1>
                    <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10 leading-relaxed">
                        ClubPlatform es la plataforma SaaS creada especialmente para Rotary.
                        Cada sección del setup tiene un agente IA que te guía. Sin experiencia técnica requerida.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <button
                            onClick={() => navigate('/#/registro')}
                            className="flex items-center justify-center gap-2 bg-[#013388] text-white font-bold px-8 py-4 rounded-2xl hover:bg-[#013388]/90 transition-all shadow-xl shadow-blue-200 text-base"
                        >
                            Crear mi sitio gratis <ArrowRight className="w-5 h-5" />
                        </button>
                        <a
                            href="https://rotaryarmeniainternacional.org"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 border border-gray-200 text-gray-700 font-bold px-8 py-4 rounded-2xl hover:bg-gray-50 transition-colors text-base"
                        >
                            Ver ejemplo en vivo <Globe className="w-5 h-5" />
                        </a>
                    </div>
                </div>

                {/* Hero visual */}
                <div className="max-w-4xl mx-auto mt-16">
                    <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden">
                        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
                            <div className="w-3 h-3 rounded-full bg-red-400" />
                            <div className="w-3 h-3 rounded-full bg-yellow-400" />
                            <div className="w-3 h-3 rounded-full bg-green-400" />
                            <span className="ml-4 text-xs text-gray-400 font-mono">miclub.clubplatform.org/admin</span>
                        </div>
                        <div className="flex">
                            {/* Sidebar mini */}
                            <div className="w-48 bg-gray-50 border-r border-gray-100 p-4 space-y-2 hidden md:block">
                                {['Overview', 'Mi Club', 'Noticias', 'Proyectos', 'Socios', 'Tienda'].map((item, i) => (
                                    <div key={item} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${i === 0 ? 'bg-[#013388] text-white' : 'text-gray-500'}`}>
                                        <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-white' : 'bg-gray-300'}`} />
                                        {item}
                                    </div>
                                ))}
                            </div>
                            {/* Content area */}
                            <div className="flex-1 p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="h-5 w-32 bg-gray-900 rounded-lg mb-1.5" />
                                        <div className="h-3 w-20 bg-gray-200 rounded" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-full bg-[#013388] flex items-center justify-center text-white text-xs font-black">R</div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-3 gap-3">
                                    {[['Socios', '42', '#013388'], ['Proyectos', '8', '#E29C00'], ['Eventos', '3', '#10b981']].map(([l, v, c]) => (
                                        <div key={l} className="rounded-2xl border border-gray-100 p-4">
                                            <div className="text-2xl font-black" style={{ color: c }}>{v}</div>
                                            <div className="text-xs text-gray-400 mt-1">{l}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 flex items-start gap-3">
                                    <div className="w-8 h-8 rounded-full bg-[#013388] flex items-center justify-center flex-shrink-0">
                                        <Bot className="w-4 h-4 text-white" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-[#013388]">Agente IA — Identidad Visual</p>
                                        <p className="text-xs text-gray-500 mt-1">¡Hola! Vamos a darle identidad visual a tu sitio. ¿Tienes listo el PNG del logo oficial de Rotary? Los márgenes se eliminan automáticamente...</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* CÓMO FUNCIONA */}
            <section id="como-funciona" className="py-24 px-6 bg-white">
                <div className="max-w-5xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-black text-gray-900 mb-4">Tan simple como 1, 2, 3</h2>
                        <p className="text-gray-500 text-lg">Sin conocimientos técnicos. Sin agencias. Solo tú y tu asistente IA.</p>
                    </div>
                    <div className="grid md:grid-cols-3 gap-8">
                        {STEPS.map(step => (
                            <div key={step.n} className="relative">
                                <div className="text-6xl font-black text-gray-100 mb-4 leading-none">{step.n}</div>
                                <h3 className="text-xl font-black text-gray-900 mb-2">{step.title}</h3>
                                <p className="text-gray-500 leading-relaxed">{step.desc}</p>
                            </div>
                        ))}
                    </div>
                    <div className="text-center mt-12">
                        <button
                            onClick={() => navigate('/#/registro')}
                            className="inline-flex items-center gap-2 bg-[#013388] text-white font-bold px-8 py-4 rounded-2xl hover:bg-[#013388]/90 transition-all shadow-xl shadow-blue-200"
                        >
                            Comenzar ahora — es gratis <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </section>

            {/* FEATURES */}
            <section id="features" className="py-24 px-6 bg-gray-50">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <h2 className="text-4xl font-black text-gray-900 mb-4">Todo lo que tu club necesita</h2>
                        <p className="text-gray-500 text-lg">Una plataforma completa, construida específicamente para la realidad de Rotary.</p>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {FEATURES.map(feat => {
                            const Icon = feat.icon;
                            return (
                                <div key={feat.title} className="bg-white rounded-2xl p-6 border border-gray-100 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                                        <Icon className="w-5 h-5 text-[#013388]" />
                                    </div>
                                    <h3 className="font-black text-gray-900 mb-2 text-sm">{feat.title}</h3>
                                    <p className="text-xs text-gray-500 leading-relaxed">{feat.desc}</p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </section>

            {/* CLUBS ACTIVOS */}
            <section className="py-24 px-6 bg-white">
                <div className="max-w-4xl mx-auto text-center">
                    <h2 className="text-4xl font-black text-gray-900 mb-4">Clubes que ya confían en ClubPlatform</h2>
                    <p className="text-gray-500 text-lg mb-12">Y creciendo cada semana con nuevos clubes de toda América Latina.</p>
                    <div className="flex flex-wrap justify-center gap-4">
                        {CLUBS.map(club => (
                            <div key={club} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-full px-5 py-2.5">
                                <CheckCircle className="w-4 h-4 text-emerald-500" />
                                <span className="text-sm font-bold text-gray-700">{club}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA FINAL */}
            <section className="py-24 px-6 bg-[#013388]">
                <div className="max-w-3xl mx-auto text-center">
                    <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-6">
                        <Shield className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-4xl font-black text-white mb-4">Tu club merece estar en línea.</h2>
                    <p className="text-blue-200 text-lg mb-10">Únete a la plataforma que está digitalizando Rotary en América Latina. Gratis para comenzar.</p>
                    <button
                        onClick={() => navigate('/#/registro')}
                        className="inline-flex items-center gap-2 bg-white text-[#013388] font-black px-8 py-4 rounded-2xl hover:bg-gray-50 transition-colors text-base shadow-2xl"
                    >
                        Crear el sitio de mi club <ArrowRight className="w-5 h-5" />
                    </button>
                </div>
            </section>

            {/* FOOTER */}
            <footer className="py-8 px-6 border-t border-gray-100">
                <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-[#013388] flex items-center justify-center">
                            <Sparkles className="w-3 h-3 text-white" />
                        </div>
                        <span className="font-black text-gray-900 text-sm">ClubPlatform</span>
                    </div>
                    <p className="text-xs text-gray-400">© 2025 ClubPlatform — Plataforma digital para clubes Rotary</p>
                    <div className="flex items-center gap-4">
                        <a href="mailto:soporte@clubplatform.org" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Soporte</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}
