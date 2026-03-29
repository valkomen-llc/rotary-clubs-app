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
                    <h1 className="text-center mb-6 drop-shadow-2xl animate-fade-in leading-tight">
                        {club.settings?.rotaract_logo ? (
                            <div className="flex justify-center items-center mb-6">
                                <img src={club.settings.rotaract_logo} alt="Rotaract Logo" className="h-[100px] md:h-[160px] w-auto object-contain" />
                            </div>
                        ) : (
                            <span className="block text-5xl md:text-7xl font-extrabold text-white mb-2">
                                Rotaract
                            </span>
                        )}
                        <span className="block text-4xl md:text-6xl font-extrabold text-rotaract">
                            {club.name.replace(/Rotary Club de |Rotary Club |Rotary /gi, '')}
                        </span>
                    </h1>
                    <p className="text-xl md:text-2xl text-white/90 max-w-2xl mx-auto font-light leading-relaxed animate-fade-in-up">
                        {getC('hero', 'subtitle', "Formando a los líderes de hoy, sirviendo a las comunidades del mañana.")}
                    </p>
                </div>

            </section>

            {/* Main Content & Stats Wrapper */}
            <section className="bg-rotary-concrete relative flex flex-col">
                {/* Intro Stats Bar */}
                <div className="relative z-20 -mt-20 max-w-5xl mx-auto px-4 w-full">
                    <div 
                        className="grid grid-cols-1 md:grid-cols-3 gap-0 rounded-3xl overflow-hidden shadow-2xl border border-white/10"
                        style={{ backgroundColor: '#d91b5c' }}
                    >
                        <div className="p-8 text-center border-b md:border-b-0 md:border-r border-white/10">
                            <Users className="w-8 h-8 text-white mx-auto mb-3" />
                            <h3 className="text-3xl font-bold text-white tracking-tight">+18</h3>
                            <p className="text-xs font-bold text-white/70 uppercase tracking-widest">Años de Edad</p>
                        </div>
                        <div className="p-8 text-center border-b md:border-b-0 md:border-r border-white/10">
                            <Globe className="w-8 h-8 text-white mx-auto mb-3" />
                            <h3 className="text-3xl font-bold text-white tracking-tight">Global</h3>
                            <p className="text-xs font-bold text-white/70 uppercase tracking-widest">Red Internacional</p>
                        </div>
                        <div className="p-8 text-center">
                            <Zap className="w-8 h-8 text-white mx-auto mb-3" />
                            <h3 className="text-3xl font-bold text-white tracking-tight">Acción</h3>
                            <p className="text-xs font-bold text-white/70 uppercase tracking-widest">Proyectos de Impacto</p>
                        </div>
                    </div>
                </div>

                <div className="py-24 md:py-32 max-w-6xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row items-center gap-16 mb-24">
                        <div className="flex-1">
                            <h2 className="text-indigo-900 text-xs font-normal uppercase tracking-[0.3em] mb-4">Misión & Propósito</h2>
                            <h3 className="text-3xl md:text-5xl font-normal text-gray-900 mb-8 leading-tight">
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
                            <h2 className="text-indigo-900 text-xs font-normal uppercase tracking-[0.3em] mb-4">Nuestro Legado</h2>
                            <h3 className="text-3xl md:text-5xl font-normal text-gray-900 mb-8 leading-tight">
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
            <section 
                className="py-24 relative overflow-hidden"
                style={{
                    backgroundColor: '#0c3c7c',
                    backgroundImage: "url('/geo-darkblue.png')",
                    backgroundPosition: '50% 0',
                    backgroundRepeat: 'repeat',
                    backgroundSize: '71px 85px'
                }}
            >
                <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
                    <h2 className="text-4xl md:text-5xl font-normal text-white mb-8">
                        ¿Estás listo para ser el <span className="text-rotaract font-normal">cambio</span>?
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

            `}</style>
        </div>
    );
};

export default Rotaract;
