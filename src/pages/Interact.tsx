import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';
import { UserPlus, Globe2, Lightbulb, ArrowRight, Smile, Star } from 'lucide-react';

const Interact = () => {
    const { club } = useClub();
    const { sections } = useCMSContent('interact', club.id);

    const getC = (section: string, field: string, fallback: string) => {
        return sections[section]?.[field] || fallback;
    }

    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Hero Section — Youth-focused, dynamic & energetic */}
            <section className="relative w-full h-[60vh] min-h-[500px] flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0">
                    <img
                        src={getC('hero', 'image', "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1600&h=600&fit=crop")}
                        alt="Interact banner"
                        className="w-full h-full object-cover scale-105 animate-subtle-zoom"
                        loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-tr from-interact-blue/60 via-transparent to-black/40" />
                </div>

                <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
                    <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-xl border border-white/20 px-5 py-2 rounded-full text-white text-xs font-bold tracking-[0.2em] uppercase mb-8 animate-fade-in-down shadow-xl">
                        <Star className="w-4 h-4 text-rotary-gold fill-rotary-gold" /> Jóvenes al Servicio del Mundo
                    </div>
                    <h1 className="text-5xl md:text-8xl font-black text-white mb-8 drop-shadow-[0_10px_10px_rgba(0,0,0,0.5)] animate-fade-in">
                        Interact <span className="text-rotary-gold">{club.name}</span>
                    </h1>
                    <p className="text-xl md:text-2xl text-white drop-shadow-md max-w-2xl mx-auto font-medium leading-relaxed animate-fade-in-up">
                        {getC('hero', 'subtitle', "Conectando jóvenes entusiastas con el poder del servicio.")}
                    </p>
                </div>

            </section>

            {/* Quick Info Section */}
            <section className="py-20 bg-white">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                        <div className="group space-y-4">
                            <div className="w-16 h-16 bg-interact-blue/5 rounded-2xl flex items-center justify-center group-hover:bg-interact-blue transition-all duration-500">
                                <UserPlus className="w-8 h-8 text-interact-blue group-hover:text-white transition-colors" />
                            </div>
                            <h4 className="text-xl font-black text-gray-900">Edad 12-18</h4>
                            <p className="text-gray-500 leading-relaxed font-light">
                                Enfocado en estudiantes de secundaria que buscan desarrollar su potencial de liderazgo.
                            </p>
                        </div>
                        <div className="group space-y-4">
                            <div className="w-16 h-16 bg-interact-blue/5 rounded-2xl flex items-center justify-center group-hover:bg-interact-blue transition-all duration-500">
                                <Globe2 className="w-8 h-8 text-interact-blue group-hover:text-white transition-colors" />
                            </div>
                            <h4 className="text-xl font-black text-gray-900">2 Proyectos Anuales</h4>
                            <p className="text-gray-500 leading-relaxed font-light">
                                Uno enfocado en la comunidad local y otro en la comprensión internacional.
                            </p>
                        </div>
                        <div className="group space-y-4">
                            <div className="w-16 h-16 bg-interact-blue/5 rounded-2xl flex items-center justify-center group-hover:bg-interact-blue transition-all duration-500">
                                <Lightbulb className="w-8 h-8 text-interact-blue group-hover:text-white transition-colors" />
                            </div>
                            <h4 className="text-xl font-black text-gray-900">Nuevas Habilidades</h4>
                            <p className="text-gray-500 leading-relaxed font-light">
                                Aprende a organizar eventos, gestionar recursos y liderar equipos de trabajo.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Content Display — Visual-heavy layout */}
            <section className="py-24 bg-gray-50 relative">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-12 items-center">
                        <div className="md:col-span-5">
                            <div className="relative">
                                <div className="absolute -inset-4 bg-rotary-gold rounded-full opacity-10 blur-2xl animate-pulse" />
                                <div className="relative rounded-[2rem] overflow-hidden shadow-2xl rotate-2 hover:rotate-0 transition-transform duration-700 aspect-square">
                                    <img
                                        src="https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800"
                                        alt="Youth group"
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="md:col-span-1" />
                        <div className="md:col-span-6">
                            <h3 className="text-interact-blue text-sm font-bold uppercase tracking-[0.4em] mb-6">¿Qué es Interact?</h3>
                            <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-8 leading-tight">
                                {getC('section1', 'title', "Liderazgo Joven en Acción")}
                            </h2>
                            <p className="text-lg text-gray-600 leading-relaxed font-light pb-8 border-b border-gray-100">
                                {getC('section1', 'content', "Interact es un club de servicio para jóvenes de 12 a 18 años que quieren conectarse con otros jóvenes de su comunidad o escuela y divertirse mientras sirven.")}
                            </p>
                            <div className="mt-8 flex items-center gap-6">
                                <div className="flex flex-col">
                                    <span className="text-2xl font-black text-gray-900 tracking-tighter">14K+</span>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Clubes Globales</span>
                                </div>
                                <div className="w-px h-10 bg-gray-200" />
                                <div className="flex flex-col">
                                    <span className="text-2xl font-black text-gray-900 tracking-tighter">340K+</span>
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Interactianos</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Quote / Highlight Section */}
            <section className="py-24 bg-white">
                <div className="max-w-4xl mx-auto px-6 text-center">
                    <Smile className="w-12 h-12 text-rotary-gold mx-auto mb-8 opacity-50" />
                    <blockquote className="text-3xl md:text-4xl font-light italic text-gray-800 leading-relaxed mb-8">
                        "{getC('intro', 'text', "Dar de sí antes de pensar en sí.")}"
                    </blockquote>
                    <cite className="text-xs font-bold uppercase tracking-[0.3em] text-interact-blue block not-italic">
                        — Lema Oficial de Interact
                    </cite>
                </div>
            </section>

            {/* Energetic Join Section */}
            <section className="py-32 bg-interact-blue relative overflow-hidden group">
                <div className="absolute inset-0 opacity-10 pointer-events-none">
                    <div className="absolute top-0 left-0 w-96 h-96 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl animate-pulse" />
                    <div className="absolute bottom-0 right-0 w-96 h-96 bg-rotary-gold rounded-full translate-x-1/2 translate-y-1/2 blur-3xl animate-pulse" />
                </div>

                <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
                    <h2 className="text-4xl md:text-6xl font-black text-white mb-8 group-hover:scale-105 transition-transform duration-700">
                        Inicia tu aventura hoy
                    </h2>
                    <p className="text-xl text-white/80 mb-12 font-light tracking-wide italic">
                        No importa tu edad, importa tu voluntad de ayudar.
                    </p>
                    <a
                        href="#/contacto"
                        className="inline-flex items-center gap-4 bg-white text-interact-blue hover:bg-rotary-gold hover:text-white px-12 py-5 rounded-full font-black shadow-[0_20px_40px_rgba(0,0,0,0.2)] hover:shadow-[0_25px_50px_rgba(0,0,0,0.3)] transition-all duration-300"
                    >
                        Únete a Interact {club.name} <ArrowRight className="w-6 h-6" />
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
                    from { opacity: 0; transform: translateY(-30px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-down {
                    animation: fade-in-down 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                @keyframes fade-in-up {
                    from { opacity: 0; transform: translateY(50px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up {
                    animation: fade-in-up 1s cubic-bezier(0.16, 1, 0.3, 1) 0.5s forwards;
                    opacity: 0;
                }
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in {
                    animation: fade-in 1.5s ease-out 0.2s forwards;
                    opacity: 0;
                }
            `}</style>
        </div>
    );
};

export default Interact;
