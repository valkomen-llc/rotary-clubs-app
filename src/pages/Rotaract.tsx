import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';
import { Users, Globe, Zap, ArrowRight, Heart, Sparkles } from 'lucide-react';

const Rotaract = () => {
    const { club } = useClub();
    const { sections } = useCMSContent('rotaract', club.id);

    const getC = (section: string, field: string, fallback: string) => {
        return sections[section]?.[field] || fallback;
    }

    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Hero Section — Premium Glassmorphism & High-Impact Typography */}
            <section className="relative w-full h-[60vh] min-h-[500px] flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0">
                    <img
                        src={getC('hero', 'image', "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&h=600&fit=crop")}
                        alt="Rotaract banner"
                        className="w-full h-full object-cover scale-105 animate-subtle-zoom"
                        loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60" />
                </div>

                <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
                    <div className="inline-flex items-center gap-2 bg-rotaract/20 backdrop-blur-md border border-rotaract/30 px-4 py-1.5 rounded-full text-white text-xs font-bold tracking-[0.2em] uppercase mb-6 animate-fade-in-down">
                        <Sparkles className="w-4 h-4 text-rotaract fill-rotaract" /> Liderazgo y Servicio Joven
                    </div>
                    <h1 className="text-5xl md:text-7xl font-extrabold text-white mb-6 drop-shadow-2xl animate-fade-in">
                        Rotaract <span className="text-rotaract">{club.name}</span>
                    </h1>
                    <p className="text-xl md:text-2xl text-white/90 max-w-2xl mx-auto font-light leading-relaxed animate-fade-in-up">
                        {getC('hero', 'subtitle', "Formando a los líderes de hoy, sirviendo a las comunidades del mañana.")}
                    </p>
                </div>

                {/* Decorative curve */}
                <div className="absolute bottom-0 left-0 w-full h-24 bg-white clip-path-slant-up" />
            </section>

            {/* Intro Stats Bar */}
            <section className="relative z-20 -mt-12 max-w-5xl mx-auto px-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-0 rounded-3xl overflow-hidden shadow-2xl border border-gray-100 bg-white/80 backdrop-blur-xl">
                    <div className="p-8 text-center border-b md:border-b-0 md:border-r border-gray-100/50">
                        <Users className="w-8 h-8 text-rotaract mx-auto mb-3" />
                        <h3 className="text-3xl font-bold text-gray-800 tracking-tight">+18</h3>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Años de Edad</p>
                    </div>
                    <div className="p-8 text-center border-b md:border-b-0 md:border-r border-gray-100/50">
                        <Globe className="w-8 h-8 text-rotaract mx-auto mb-3" />
                        <h3 className="text-3xl font-bold text-gray-800 tracking-tight">Global</h3>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Red Internacional</p>
                    </div>
                    <div className="p-8 text-center">
                        <Zap className="w-8 h-8 text-rotaract mx-auto mb-3" />
                        <h3 className="text-3xl font-bold text-gray-800 tracking-tight">Acción</h3>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Proyectos de Impacto</p>
                    </div>
                </div>
            </section>

            {/* Main Content — Modern Alternating Layout */}
            <section className="py-24 md:py-32 bg-white">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row items-center gap-16 mb-24">
                        <div className="flex-1">
                            <h2 className="text-indigo-900 text-xs font-bold uppercase tracking-[0.3em] mb-4">Misión & Propósito</h2>
                            <h3 className="text-3xl md:text-5xl font-black text-gray-900 mb-8 leading-tight">
                                {getC('section1', 'title', "¿Qué es Rotaract?")}
                            </h3>
                            <p className="text-lg text-gray-600 leading-relaxed mb-6 font-light">
                                {getC('section1', 'content', "Los clubes Rotaract ofrecen a personas de 18 años en adelante la oportunidad de intercambiar ideas con los líderes de la comunidad, adquirir habilidades profesionales y de liderazgo y, sobre todo, servir y divertirse.")}
                            </p>
                            <ul className="space-y-4">
                                {['Desarrollo profesional', 'Servicio a la comunidad', 'Comprensión internacional'].map((item) => (
                                    <li key={item} className="flex items-center gap-3 text-gray-700 font-bold">
                                        <div className="w-2 h-2 rounded-full bg-rotaract" /> {item}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="flex-1 relative">
                            <div className="absolute -top-10 -left-10 w-40 h-40 bg-rotary-gold/10 rounded-full blur-3xl animate-pulse" />
                            <div className="relative rounded-3xl overflow-hidden shadow-2xl skew-y-1 hover:skew-y-0 transition-transform duration-700 border-8 border-white">
                                <img
                                    src="https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=800&h=800&fit=crop"
                                    alt="Community action"
                                    className="w-full grayscale-[50%] hover:grayscale-0 transition-all duration-1000"
                                    loading="lazy"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col md:flex-row-reverse items-center gap-16">
                        <div className="flex-1">
                            <h2 className="text-indigo-900 text-xs font-bold uppercase tracking-[0.3em] mb-4">Nuestro Legado</h2>
                            <h3 className="text-3xl md:text-5xl font-black text-gray-900 mb-8 leading-tight">
                                {getC('section2', 'title', "Nuestro Impacto")}
                            </h3>
                            <p className="text-lg text-gray-600 leading-relaxed mb-8 font-light">
                                {getC('section2', 'content', "A través de proyectos de servicio local e internacional, los socios de Rotaract ayudan a mejorar la vida de los demás.")}
                            </p>
                            <div className="grid grid-cols-2 gap-6">
                                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 hover:border-rotaract/30 transition-colors group">
                                    <Heart className="w-8 h-8 text-rotaract mb-3 group-hover:scale-110 transition-transform" />
                                    <p className="text-sm font-bold text-gray-800">Causas Sociales</p>
                                </div>
                                <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 hover:border-rotaract/30 transition-colors group">
                                    <Users className="w-8 h-8 text-rotaract mb-3 group-hover:scale-110 transition-transform" />
                                    <p className="text-sm font-bold text-gray-800">Networking</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex-1 relative">
                            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-rotaract/10 rounded-full blur-3xl animate-pulse" />
                            <div className="relative rounded-3xl overflow-hidden shadow-2xl -skew-y-1 hover:skew-y-0 transition-transform duration-700 border-8 border-white">
                                <img
                                    src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=800&fit=crop"
                                    alt="Leaders collaborate"
                                    className="w-full grayscale-[50%] hover:grayscale-0 transition-all duration-1000"
                                    loading="lazy"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Premium CTA Section */}
            <section className="py-24 bg-rotary-geo relative overflow-hidden">
                <div className="absolute inset-0 bg-rotary-blue shadow-inner" />
                <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
                    <h2 className="text-4xl md:text-5xl font-black text-white mb-8">
                        ¿Estás listo para ser el <span className="text-rotaract">cambio</span>?
                    </h2>
                    <p className="text-xl text-white/80 mb-12 font-light max-w-2xl mx-auto">
                        Únete a Rotaract {club.name} y comienza tu viaje de liderazgo y servicio hoy mismo.
                    </p>
                    <a
                        href="#/contacto"
                        className="inline-flex items-center gap-3 bg-rotaract hover:bg-rotaract/90 text-white px-10 py-5 rounded-full font-black shadow-2xl hover:translate-y-[-4px] active:translate-y-0 transition-all duration-300"
                    >
                        Quiero Ser Parte <ArrowRight className="w-5 h-5" />
                    </a>
                </div>
            </section>

            <Footer />

            <style>{`
                @keyframes subtle-zoom {
                    from { transform: scale(1.05); }
                    to { transform: scale(1.15); }
                }
                .animate-subtle-zoom {
                    animation: subtle-zoom 20s ease-out alternate infinite;
                }
                @keyframes fade-in-down {
                    from { opacity: 0; transform: translateY(-20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-down {
                    animation: fade-in-down 0.8s ease-out forwards;
                }
                @keyframes fade-in-up {
                    from { opacity: 0; transform: translateY(30px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up {
                    animation: fade-in-up 0.8s ease-out 0.4s forwards;
                    opacity: 0;
                }
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in {
                    animation: fade-in 1.2s ease-out 0.2s forwards;
                    opacity: 0;
                }
                .clip-path-slant-up {
                    clip-path: polygon(0 100%, 100% 100%, 100% 0);
                }
            `}</style>
        </div>
    );
};

export default Rotaract;
