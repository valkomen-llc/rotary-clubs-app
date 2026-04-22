import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Globe, Users, Zap, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react';

const LandingPage = () => {
    useEffect(() => {
        // REGLA DE REDIRECCIÓN SAAS (Prioridad Absoluta)
        window.location.replace('https://app.clubplatform.org/');
    }, []);

    return (
        <div className="min-h-screen bg-[#0A0F1C] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30">
            {/* Minimalist SaaS Navbar */}
            <nav className="border-b border-slate-800/60 bg-[#0A0F1C]/80 backdrop-blur-md py-4 px-6 md:px-12 flex justify-between items-center sticky top-0 z-50">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Globe className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-white">Club<span className="text-indigo-400">Platform</span></span>
                </div>
                <div className="flex gap-6 items-center">
                    <button onClick={() => window.location.href = 'https://app.clubplatform.org/login'} className="text-sm font-medium text-slate-300 hover:text-white transition-colors">
                        Panel de Control
                    </button>
                    <Link to="/register" className="bg-white text-[#0A0F1C] px-5 py-2.5 rounded-full text-sm font-bold hover:bg-slate-200 transition-all hidden md:block">
                        Comenzar Gratis
                    </Link>
                </div>
            </nav>

            {/* Tech SaaS Hero Section */}
            <section className="relative pt-32 pb-40 px-6 text-center overflow-hidden">
                {/* Background Glows */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>

                <div className="relative max-w-4xl mx-auto space-y-8 animate-in fly-in-from-bottom-8 duration-700">
                    <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-full border border-slate-700/50 backdrop-blur-md text-sm font-medium text-indigo-300 mb-4">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                        </span>
                        La infraestructura definitiva para Clubes
                    </div>

                    <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1]">
                        Construye el futuro de tu <br className="hidden md:block" />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400">
                            Club en piloto automático.
                        </span>
                    </h1>

                    <p className="text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
                        Despliega un portal web profesional, administra tus socios, y recolecta donaciones globales. Todo impulsado por una plataforma de última generación.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4 justify-center pt-8">
                        <Link to="/register" className="bg-indigo-600 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-xl shadow-indigo-600/20 hover:bg-indigo-500 hover:scale-105 transition-all flex items-center justify-center gap-2 group">
                            Desplegar mi Club <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <a href="#features" className="bg-slate-800/50 text-white border border-slate-700 px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-800 transition-colors flex items-center justify-center">
                            Explorar Arquitectura
                        </a>
                    </div>
                </div>
            </section>

            {/* Dark Mode Features Grid */}
            <section id="features" className="py-24 px-6 max-w-7xl mx-auto relative border-t border-slate-800/60">
                <div className="text-center mb-20">
                    <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Sistema Todo-en-Uno</h2>
                    <p className="text-slate-400 max-w-2xl mx-auto text-lg">Reemplaza el caos de múltiples herramientas con un ecosistema sincronizado.</p>
                </div>

                {/* Feature Image/Preview */}
                <div className="relative order-1 lg:order-2">
                    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50 p-2 backdrop-blur-sm relative z-10">
                        <img
                            src="/bot-mockup.png"
                            alt="CRM y Notificaciones Automáticas"
                            className="rounded-xl border border-slate-700/50 shadow-2xl w-full object-cover"
                        />
                    </div>
                </div>
                {/* Hero Dashboard/Product Preview */}
                <div className="relative mt-20 mx-auto max-w-5xl">
                    <div className="rounded-xl border border-slate-800/60 bg-slate-900/50 p-2 backdrop-blur-sm shadow-2xl">
                        <img
                            src="/dashboard-mockup.png"
                            alt="Plataforma ClubPlatform Dashboard"
                            className="rounded-lg border border-slate-700/50 shadow-2xl mx-auto w-full object-cover"
                        />
                    </div>
                </div>
                <div className="grid md:grid-cols-3 gap-6">
                    {[
                        {
                            title: 'Despliegue Instantáneo',
                            desc: 'Motor de renderizado ultrarrápido con subdominio gratuito y certificado SSL automático en segundos.',
                            icon: <Zap className="w-6 h-6 text-indigo-400" />,
                            bg: 'bg-indigo-500/10',
                            border: 'border-indigo-500/20'
                        },
                        {
                            title: 'CRM Dinámico',
                            desc: 'Base de datos inteligente para gestión de socios. Notificaciones automatizadas por Mail y WhatsApp.',
                            icon: <Users className="w-6 h-6 text-purple-400" />,
                            bg: 'bg-purple-500/10',
                            border: 'border-purple-500/20'
                        },
                        {
                            title: 'Motor de Finanzas',
                            desc: 'Pasarelas de donación globales. Conexión directa con Stripe y PayPal con cálculos de billetera en tiempo real.',
                            icon: <ShieldCheck className="w-6 h-6 text-pink-400" />,
                            bg: 'bg-pink-500/10',
                            border: 'border-pink-500/20'
                        }
                    ].map((feature, idx) => (
                        <div key={idx} className="bg-slate-900/50 backdrop-blur-sm p-8 rounded-3xl border border-slate-800 hover:border-slate-700 transition-colors group">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform border ${feature.bg} ${feature.border}`}>
                                {feature.icon}
                            </div>
                            <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                            <p className="text-slate-400 leading-relaxed">{feature.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Sleek CTA */}
            <section className="py-24 px-6 text-center border-t border-slate-800/60 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-indigo-900/20 pointer-events-none"></div>
                <div className="relative max-w-3xl mx-auto">
                    <h2 className="text-4xl font-bold mb-6 text-white">Escala tu impacto hoy</h2>
                    <p className="text-slate-400 mb-10 text-lg">Pasa de configurar servidores a ejecutar proyectos humanitarios en minutos.</p>

                    <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-10">
                        <span className="flex items-center gap-2 text-sm font-medium text-slate-300"><CheckCircle2 className="w-5 h-5 text-indigo-400" /> Cero código requerido</span>
                        <span className="flex items-center gap-2 text-sm font-medium text-slate-300"><CheckCircle2 className="w-5 h-5 text-indigo-400" /> Subdominio gratis incluido</span>
                    </div>

                    <Link to="/register" className="bg-white text-[#0A0F1C] px-10 py-4 rounded-xl font-bold text-lg shadow-xl shadow-white/10 hover:bg-slate-200 transition-colors inline-block">
                        Iniciar Despliegue
                    </Link>
                </div>
            </section>

            {/* Tech Footer */}
            <footer className="border-t border-slate-800/60 py-12 px-6 text-center bg-[#05080f]">
                <div className="flex items-center gap-2 mb-4 md:mb-0 justify-center">
                    <Globe className="w-6 h-6 text-indigo-500" />
                    <span className="text-lg font-bold tracking-tight text-slate-500">ClubPlatform SaaS</span>
                </div>
                <p className="text-slate-600 text-sm">© {new Date().getFullYear()} Software Architecture. Todos los derechos reservados.</p>
            </footer>
        </div>
    );
};

export default LandingPage;
