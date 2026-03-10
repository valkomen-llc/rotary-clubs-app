import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';
import { Shrub, Landmark, ShieldCheck, HeartHandshake, ArrowUpRight, Award } from 'lucide-react';

const FundacionRotaria = () => {
    const { club } = useClub();
    const { sections } = useCMSContent('fundacion-rotaria', club.id);

    const getC = (section: string, field: string, fallback: string) => {
        return sections[section]?.[field] || fallback;
    }

    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Hero Section — Elegant & Inspiring */}
            <section className="relative w-full h-[70vh] min-h-[600px] flex items-center overflow-hidden">
                <div className="absolute inset-0">
                    <img
                        src={getC('hero', 'image', "https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=1600&h=600&fit=crop")}
                        alt="La Fundación Rotaria"
                        className="w-full h-full object-cover animate-subtle-zoom"
                    />
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" />
                </div>

                <div className="relative z-10 max-w-7xl mx-auto px-6 w-full">
                    <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-3 bg-rotary-gold text-rotary-blue px-6 py-2 rounded-full text-xs font-black uppercase tracking-[0.2em] mb-8 animate-slide-right">
                            <Award className="w-4 h-4" /> Excelencia Humanitaria
                        </div>
                        <h1 className="text-6xl md:text-8xl font-black text-white mb-8 leading-[0.9] animate-fade-in">
                            La Fundación <br />
                            <span className="text-rotary-gold">Rotaria</span>
                        </h1>
                        <p className="text-xl md:text-2xl text-white/80 font-light leading-relaxed mb-12 animate-fade-in-up">
                            {getC('intro', 'text', "Transformando contribuciones en proyectos que cambian vidas de forma sostenible.")}
                        </p>
                    </div>
                </div>

                {/* Scroll Indicator */}
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 animate-bounce">
                    <div className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center p-1">
                        <div className="w-1 h-2 bg-rotary-gold rounded-full" />
                    </div>
                </div>
            </section>

            {/* Impact Highlights Bar */}
            <section className="bg-rotary-blue py-10">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-white">
                        <div className="text-center">
                            <p className="text-3xl font-black text-rotary-gold">$4,000M</p>
                            <p className="text-[10px] uppercase font-bold tracking-widest opacity-60">Invertidos</p>
                        </div>
                        <div className="text-center">
                            <p className="text-3xl font-black text-rotary-gold">100+</p>
                            <p className="text-[10px] uppercase font-bold tracking-widest opacity-60">Años de Historia</p>
                        </div>
                        <div className="text-center">
                            <p className="text-3xl font-black text-rotary-gold">4 Estrellas</p>
                            <p className="text-[10px] uppercase font-bold tracking-widest opacity-60">Calificación Charity Nav</p>
                        </div>
                        <div className="text-center">
                            <p className="text-3xl font-black text-rotary-gold">1.4M</p>
                            <p className="text-[10px] uppercase font-bold tracking-widest opacity-60">Socios activos</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Mission & Vision Section */}
            <section className="py-32 bg-white">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-24 items-center">
                        <div className="order-2 md:order-1">
                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <div className="bg-gray-50 p-8 rounded-3xl border border-gray-100 hover:shadow-xl transition-all duration-500 group">
                                        <Shrub className="w-12 h-12 text-rotary-blue mb-4 group-hover:scale-110 transition-transform" />
                                        <h4 className="text-lg font-black text-gray-900">Sostenibilidad</h4>
                                        <p className="text-sm text-gray-500 leading-relaxed">Proyectos que perduran en el tiempo sin dependencia externa.</p>
                                    </div>
                                    <div className="bg-gray-50 p-8 rounded-3xl border border-gray-100 hover:shadow-xl transition-all duration-500 group translate-y-8">
                                        <ShieldCheck className="w-12 h-12 text-rotary-blue mb-4 group-hover:scale-110 transition-transform" />
                                        <h4 className="text-lg font-black text-gray-900">Transparencia</h4>
                                        <p className="text-sm text-gray-500 leading-relaxed">Máxima calificación en gestión de recursos a nivel mundial.</p>
                                    </div>
                                </div>
                                <div className="space-y-6 pt-12">
                                    <div className="bg-gray-50 p-8 rounded-3xl border border-gray-100 hover:shadow-xl transition-all duration-500 group">
                                        <Landmark className="w-12 h-12 text-rotary-blue mb-4 group-hover:scale-110 transition-transform" />
                                        <h4 className="text-lg font-black text-gray-900">Institucional</h4>
                                        <p className="text-sm text-gray-500 leading-relaxed">El brazo financiero que da soporte a la visión de Rotary.</p>
                                    </div>
                                    <div className="bg-gray-50 p-8 rounded-3xl border border-gray-100 hover:shadow-xl transition-all duration-500 group translate-y-8">
                                        <HeartHandshake className="w-12 h-12 text-rotary-blue mb-4 group-hover:scale-110 transition-transform" />
                                        <h4 className="text-lg font-black text-gray-900">Paz</h4>
                                        <p className="text-sm text-gray-500 leading-relaxed">Fomentando la comprensión mundial a través de becas y servicio.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="order-1 md:order-2">
                            <h3 className="text-rotary-blue text-sm font-bold uppercase tracking-[0.4em] mb-6">Nuestra Misión</h3>
                            <h2 className="text-4xl md:text-5xl font-black text-gray-900 mb-8 leading-tight">
                                {getC('section1', 'title', "Hacer el bien en el mundo")}
                            </h2>
                            <p className="text-xl text-gray-600 leading-relaxed font-light mb-12">
                                {getC('section1', 'content', "La misión de La Fundación Rotaria es permitir que los rotarios promuevan la comprensión mundial, la buena voluntad y la paz a través del mejoramiento de la salud, el apoyo a la educación y el alivio de la pobreza.")}
                            </p>
                            <div className="p-8 bg-indigo-900 rounded-[2.5rem] text-white flex items-center justify-between group cursor-pointer hover:bg-black transition-colors duration-500">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-widest opacity-60 mb-1">Tu impacto importa</p>
                                    <p className="text-xl font-black">Haz una donación hoy</p>
                                </div>
                                <div className="w-12 h-12 bg-rotary-gold rounded-full flex items-center justify-center group-hover:rotate-45 transition-transform duration-500">
                                    <ArrowUpRight className="w-6 h-6 text-rotary-blue" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Global Impact Grid */}
            <section className="py-32 bg-gray-50">
                <div className="max-w-7xl mx-auto px-6 text-center mb-20">
                    <h2 className="text-indigo-900 text-xs font-bold uppercase tracking-[0.4em] mb-6">Nuestro Alcance</h2>
                    <h3 className="text-4xl md:text-6xl font-black text-gray-900">Impacto Global {club.name}</h3>
                </div>

                <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="group relative overflow-hidden rounded-[3rem] aspect-[4/3] bg-black">
                        <img
                            src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1000"
                            alt="Humanitarian project"
                            className="w-full h-full object-cover opacity-60 group-hover:scale-110 group-hover:opacity-40 transition-all duration-1000"
                        />
                        <div className="absolute inset-0 p-12 flex flex-col justify-end">
                            <h4 className="text-2xl font-black text-white mb-4">Salud y Prevención</h4>
                            <p className="text-white/70 font-light leading-relaxed max-w-sm">Trabajamos incansablemente para erradicar enfermedades como la Polio y mejorar el acceso médico.</p>
                        </div>
                    </div>

                    <div className="group relative overflow-hidden rounded-[3rem] aspect-[4/3] bg-black">
                        <img
                            src="https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=1000"
                            alt="Education project"
                            className="w-full h-full object-cover opacity-60 group-hover:scale-110 group-hover:opacity-40 transition-all duration-1000"
                        />
                        <div className="absolute inset-0 p-12 flex flex-col justify-end text-right items-end">
                            <h4 className="text-2xl font-black text-white mb-4 text-right">Educación y Alfabetización</h4>
                            <p className="text-white/70 font-light leading-relaxed max-w-sm">Empoderamos a las comunidades a través del conocimiento y el acceso a la educación básica.</p>
                        </div>
                    </div>
                </div>
            </section>

            <Footer />

            <style>{`
                @keyframes subtle-zoom {
                    from { transform: scale(1); }
                    to { transform: scale(1.1); }
                }
                .animate-subtle-zoom {
                    animation: subtle-zoom 15s ease-out forwards;
                }
                @keyframes slide-right {
                    from { opacity: 0; transform: translateX(-30px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                .animate-slide-right {
                    animation: slide-right 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                @keyframes fade-in-up {
                    from { opacity: 0; transform: translateY(40px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fade-in-up {
                    animation: fade-in-up 1s cubic-bezier(0.16, 1, 0.3, 1) 0.6s forwards;
                    opacity: 0;
                }
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .animate-fade-in {
                    animation: fade-in 1.5s ease-out 0.3s forwards;
                    opacity: 0;
                }
            `}</style>
        </div>
    );
};

export default FundacionRotaria;
