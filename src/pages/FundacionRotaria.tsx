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
            <main className="flex-1 mt-[104px]">
                
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

            </main>

            <Footer />
        </div>
    );
};

export default FundacionRotaria;
