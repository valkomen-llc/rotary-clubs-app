import { useState } from 'react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';
import { Users, Globe, Zap, ArrowRight, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';

const Rotaract = () => {
    const { club } = useClub();
    const { sections } = useCMSContent('rotaract', club.id);
    const [currentImage, setCurrentImage] = useState(0);

    const rotaractGallery = [
        "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1200&h=800&fit=crop",
        "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=1200&h=800&fit=crop",
        "https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&h=800&fit=crop"
    ];

    const nextImage = () => setCurrentImage((prev) => (prev + 1) % rotaractGallery.length);
    const prevImage = () => setCurrentImage((prev) => (prev - 1 + rotaractGallery.length) % rotaractGallery.length);

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

                <div className="py-24 md:py-32 max-w-5xl mx-auto px-6">
                    {/* Intro Hero Text */}
                    <div className="text-center mb-16">
                        <h2 className="text-[25px] font-normal text-rotary-navy leading-tight max-w-4xl mx-auto">
                            Únete al movimiento internacional de jóvenes líderes, quienes dan cara a los problemas más acuciantes del mundo con soluciones innovadoras.
                        </h2>
                    </div>

                    {/* Video Player */}
                    <div className="relative rounded-3xl overflow-hidden shadow-2xl border-4 border-white mb-16 group bg-black">
                        <video 
                            controls
                            className="w-full aspect-video object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-500"
                            poster="https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=1200&h=675&fit=crop"
                        >
                            <source src="https://cdn1-originals.webdamdb.com/13799_104818460?cache=1692205462&response-content-disposition=inline;filename=2019_112_RotaractRecruitment_ES.mp4&Policy=eyJTdGF0ZW1lbnQiOlt7IlJlc291cmNlIjoiaHR0cCo6Ly9jZG4xLW9yaWdpbmFscy53ZWJkYW1kYi5jb20vMTM3OTlfMTA0ODE4NDYwP2NhY2hlPTE2OTIyMDU0NjImcmVzcG9uc2UtY29udGVudC1kaXNwb3NpdGlvbj1pbmxpbmU7ZmlsZW5hbWU9MjAxOV8xMTJfUm90YXJhY3RSZWNydWl0bWVudF9FUy5tcDQiLCJDb25kaXRpb24iOnsiRGF0ZUxlc3NUaGFuIjp7IkFXUzpFcG9jaFRpbWUiOjIxNDc0MTQ0MDB9fX1dfQ__&Signature=TArO9B21cApRnSv2Di~IuA02tCq-GXx9YqjOyu9zkwWhSSKP1I6suUKHSlFyky~KMYtgn50imYd~N-d-b1d8jq~4forns0v56DIISmv8SlE2ZBA4LeH07v67X8DlQBxc1lvcKW6yTfmiGQVOaFL4XyL2-SFFQrYUrydBCdDQ14u0F1r7y37a8wPZIHbtwMzG5hObyq6G6O-WqFSKQbgc24vBvWXPeVy1r-kx6qA7nKLF0~jQeOIZKqoxikhipoC151CbkTqepklvI34GrN9hwN6UtdjEro5XizDClXaR6qD1cPOwfH3bmvJ4CJPlDVrXxOhNVh-IYbQXKBp4-llh4Q__&Key-Pair-Id=APKAI2ASI2IOLRFF2RHA" type="video/mp4" />
                            Tu navegador no soporta la etiqueta de video.
                        </video>
                    </div>

                    {/* Description Paragraphs */}
                    <div className="space-y-6 text-xl text-gray-700 font-light leading-relaxed mb-20 max-w-4xl mx-auto">
                        <p>
                            Los clubes Rotaract ofrecen a personas de 18 años de edad en adelante la oportunidad de
                            intercambiar ideas con los líderes de la comunidad, adquirir habilidades profesionales y de
                            liderazgo y, sobre todo, de servir y divertirse a la vez.
                        </p>
                        <p>
                            Los socios de Rotary y Rotaract trabajan hombro a hombro en todo el mundo para tomar
                            acción mediante el servicio. Ya sea en grandes urbes o zonas rurales, Rotaract marca el cambio
                            en comunidades como la tuya.
                        </p>
                    </div>

                    {/* How they work Section */}
                    <div className="bg-white p-10 md:p-14 rounded-[3rem] shadow-xl border border-gray-100 flex flex-col md:flex-row gap-10 items-start relative overflow-hidden">
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-rotary-gold/20 rounded-full blur-3xl animate-pulse" />
                        <div className="flex-shrink-0 w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100 relative z-10">
                            <Users className="w-8 h-8 text-rotaract" />
                        </div>
                        <div className="relative z-10">
                            <h3 className="text-3xl font-normal text-rotary-navy mb-4">¿Cómo funcionan?</h3>
                            <p className="text-lg text-gray-600 leading-relaxed font-light">
                                Los clubes Rotaract deciden cómo van a organizar y gestionar sus operaciones, administrar sus 
                                fondos y planificar e implementar actividades y proyectos de servicio a favor de causas que son 
                                importantes en la comunidad. Los socios del club rotario patrocinador sirven de mentores y 
                                trabajan con los rotaractianos como socios en el servicio.
                            </p>
                        </div>
                    </div>

                    {/* Image Gallery */}
                    <div className="mt-20">
                        <div className="relative aspect-video rounded-3xl overflow-hidden shadow-2xl ring-1 ring-gray-200 bg-black">
                            <img
                                src={rotaractGallery[currentImage]}
                                alt={`Gallery image ${currentImage + 1}`}
                                className="w-full h-full object-cover transition-transform duration-500"
                            />

                            <button
                                onClick={prevImage}
                                className="absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 bg-white/90 hover:bg-white rounded-full shadow-xl flex items-center justify-center transition-colors z-10"
                                aria-label="Imagen anterior"
                            >
                                <ChevronLeft className="w-8 h-8 text-rotary-navy" />
                            </button>
                            <button
                                onClick={nextImage}
                                className="absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 bg-white/90 hover:bg-white rounded-full shadow-xl flex items-center justify-center transition-colors z-10"
                                aria-label="Siguiente imagen"
                            >
                                <ChevronRight className="w-8 h-8 text-rotary-navy" />
                            </button>
                        </div>

                        <div className="flex justify-center gap-3 mt-8">
                            {rotaractGallery.map((_: any, index: number) => (
                                <button
                                    key={index}
                                    onClick={() => setCurrentImage(index)}
                                    className={`
                                        w-3 h-3 rounded-full transition-all duration-300
                                        ${currentImage === index 
                                            ? 'bg-rotaract w-8 shadow-md' 
                                            : 'bg-gray-300 hover:bg-gray-400'}
                                    `}
                                    aria-label={`Ir a la imagen ${index + 1}`}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Premium CTA Section */}
            <section 
                className="py-24 bg-rotary-geo relative overflow-hidden"
            >
                <div className="absolute inset-0 bg-rotary-blue/90 mix-blend-multiply" />
                <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
                    <h2 className="text-4xl md:text-5xl font-normal text-white mb-6">
                        ¿Qué hago para ingresar a un club?
                    </h2>
                    <p className="text-2xl text-white/90 mb-12 font-light max-w-3xl mx-auto">
                        Háblanos un poco de ti para que podamos ponerte en contacto con el club adecuado.
                    </p>
                    <a
                        href="/unete"
                        className="inline-flex items-center gap-2 bg-sky-100 hover:bg-white text-rotary-blue font-bold px-10 py-4 text-lg rounded-full transition-all duration-300 shadow-2xl hover:shadow-sky-500/50 hover:-translate-y-1"
                    >
                        EMPIEZA <ArrowRight className="w-6 h-6" />
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
