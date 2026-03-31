import { useState, useEffect } from 'react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { useCMSContent } from '../hooks/useCMSContent';

// Slides base para la Fundación Rotaria (Reemplazan fácilmente con CMS posterior)
const defaultSlides = [
  { id: 1, image: 'https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=1600&h=800&fit=crop', alt: 'Fundación Rotaria 1' },
  { id: 2, image: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=1600&h=800&fit=crop', alt: 'Fundación Rotaria 2' },
  { id: 3, image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=1600&h=800&fit=crop', alt: 'Fundación Rotaria 3' },
];

const FundacionRotaria = () => {
    const { club } = useClub();
    const { sections } = useCMSContent('fundacion-rotaria', club.id);
    const [currentSlide, setCurrentSlide] = useState(0);

    // Ayuda a leer contenido del CMS o poner texto de prueba
    const getC = (section: string, field: string, fallback: string) => {
        return sections[section]?.[field] || fallback;
    };

    // Al llegar, hacer scroll al inicio
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    // Rotación automática del slider
    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % defaultSlides.length);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <Navbar />

            <style>{`
                @keyframes zoomIn {
                    0% { transform: scale(1); }
                    100% { transform: scale(1.08); }
                }
                .hero-slide-image {
                    animation: zoomIn 5s ease-out forwards;
                }
            `}</style>

            {/* Contenedores reemplazados (Hero + Header Azul) */}
            <main className="flex-1">
                
                {/* 1. Hero (Clonado de Intercambio de Jóvenes) */}
                <section className="relative w-full h-[500px] md:h-[600px] overflow-hidden">
                    <div className="absolute inset-0">
                        {defaultSlides.map((slide, index) => (
                            <div
                                key={slide.id}
                                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                                    index === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0'
                                }`}
                            >
                                <img 
                                    src={slide.image} 
                                    alt={slide.alt} 
                                    className={`w-full h-full object-cover ${index === currentSlide ? 'hero-slide-image' : ''}`}
                                />
                            </div>
                        ))}
                        <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent z-20" />
                    </div>
                    
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex gap-2">
                        {defaultSlides.map((_, index) => (
                            <button
                                key={index}
                                onClick={() => setCurrentSlide(index)}
                                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                                    index === currentSlide 
                                        ? 'bg-white w-8' 
                                        : 'bg-white/50 hover:bg-white/70'
                                }`}
                                aria-label={`Ir a slide ${index + 1}`}
                            />
                        ))}
                    </div>
                </section>

                {/* 2. Segundo Contenedor (Clonado de Intercambio de Jóvenes) */}
                <section
                    className="py-12 md:py-16"
                    style={{
                        backgroundColor: '#0c3c7c',
                        backgroundImage: "url('/geo-darkblue.png')",
                        backgroundPosition: '50% 0',
                        backgroundRepeat: 'repeat',
                        backgroundSize: '71px 85px'
                    }}
                >
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center flex flex-col items-center justify-center">
                        <h1 className="text-white font-normal mb-2" style={{ fontSize: '35px' }}>
                            {getC('hero', 'title', "La Fundación Rotaria")}
                        </h1>
                        <p className="text-white/80 mt-2 italic text-lg opacity-90 text-center">
                            {getC('hero', 'description', `Transformando contribuciones en proyectos de servicio que cambian vidas en el mundo entero.`)}
                        </p>
                    </div>
                </section>

                {/* 3. Contenedor de Textos Misión e Impacto */}
                <section className="py-20 md:py-28 bg-white">
                    <div className="max-w-4xl mx-auto px-6 text-gray-800">
                        {/* Header Text Centered */}
                        <div className="text-center mb-16">
                            <h2 className="text-3xl md:text-[34px] font-normal text-gray-700 mb-8 leading-snug">
                                La Fundación Rotaria transforma tus contribuciones en proyectos de servicio que cambian vidas en nuestras comunidades locales y en todo el mundo.
                            </h2>
                            <p className="text-lg leading-relaxed text-gray-800 mb-6">
                                Desde su creación hace más de 100 años, la Fundación ha invertido más de USD 4000 millones en proyectos humanitarios transformadores y sostenibles.
                            </p>
                            <p className="text-lg leading-relaxed text-gray-800">
                                Juntos, podemos generar un impacto en tu comunidad y en todo el mundo.
                            </p>
                        </div>

                        {/* Nuestra Misión */}
                        <div className="mb-12">
                            <h3 className="text-3xl font-bold text-[#333333] mb-6">Nuestra misión</h3>
                            <p className="text-lg leading-relaxed text-gray-800">
                                La Fundación Rotaria ayuda a los socios de Rotary a fomentar la comprensión mundial, la buena voluntad y la paz mediante el mejoramiento de la salud, del medioambiente, el suministro de educación de calidad y la mitigación de la pobreza.
                            </p>
                        </div>

                        {/* Qué impacto puede generar */}
                        <div className="mb-12">
                            <h3 className="text-3xl font-bold text-[#333333] mb-6">¿Qué impacto puede generar una donación?</h3>
                            <ul className="space-y-4">
                                <li className="flex items-start">
                                    <span className="mr-3 font-bold text-gray-700 mt-1">•</span>
                                    <p className="text-lg text-gray-800">3 dólares es el costo promedio para proteger completamente a un niño contra la polio.</p>
                                </li>
                                <li className="flex items-start">
                                    <span className="mr-3 font-bold text-gray-700 mt-1">•</span>
                                    <p className="text-lg text-gray-800">50 dólares permiten mantener filtros de agua para combatir las enfermedades transmitidas por el agua.</p>
                                </li>
                                <li className="flex items-start">
                                    <span className="mr-3 font-bold text-gray-700 mt-1">•</span>
                                    <p className="text-lg text-gray-800">200 dólares permiten crear oportunidades de trabajo mediante la sustitución del ganado de las personas afectadas por desastres.</p>
                                </li>
                            </ul>
                        </div>

                        {/* Botón */}
                        <div className="mt-12">
                            <a 
                                href="https://my.rotary.org/es/donate"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block bg-[#00a3e0] hover:bg-[#008cc0] text-white font-bold py-4 px-10 rounded-full transition-colors duration-300 text-sm tracking-wide"
                            >
                                DONA HOY MISMO
                            </a>
                        </div>
                    </div>
                </section>

            </main>

            <Footer />
        </div>
    );
};

export default FundacionRotaria;
