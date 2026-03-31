import { useEffect } from 'react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import FoundationImpactCarousel from '../sections/FoundationImpactCarousel';
import FoundationImpactSection from '../sections/FoundationImpactSection';
import { useClub } from '../contexts/ClubContext';
import { useCMSContent } from '../hooks/useCMSContent';

const FundacionRotaria = () => {
    const { club } = useClub();
    const { sections } = useCMSContent('fundacion-rotaria', club.id);

    // Ayuda a leer contenido del CMS o poner texto de prueba
    const getC = (section: string, field: string, fallback: string) => {
        return sections[section]?.[field] || fallback;
    };

    // Al llegar, hacer scroll al inicio
    useEffect(() => {
        window.scrollTo(0, 0);
    }, []);

    // Cargar script de Infogram para las gráficas
    useEffect(() => {
        const i = "infogram-async";
        const s = "https://e.infogram.com/js/dist/embed-loader-min.js";
        if (!document.getElementById(i)) {
            const r = document.createElement("script");
            r.async = true;
            r.id = i;
            r.src = s;
            document.head.appendChild(r);
        } else if ((window as any).InfogramEmbeds && (window as any).InfogramEmbeds.process) {
            (window as any).InfogramEmbeds.process();
        }
    }, []);

    // Imagen por defecto del Hero (igual que en Quiénes Somos pero con foto de la Fundación si se desea)
    const heroImage = getC('hero', 'image', "https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=1600&h=800&fit=crop");

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <Navbar />

            <main className="flex-1">
                
                {/* 1. Hero (Estructura de Quiénes Somos) */}
                <section className="relative w-full h-[300px] md:h-[400px] overflow-hidden">
                    <div className="absolute inset-0">
                    <img
                        src={heroImage}
                        alt="Nuestra Fundación"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30" />
                    </div>
                    <div className="relative h-full flex items-center justify-center">
                    <h1 className="text-4xl md:text-5xl text-white">
                        {getC('hero', 'title', "Nuestra Fundación")}
                    </h1>
                    </div>
                </section>

                {/* 2. Segundo Contenedor (Estructura de Quiénes Somos) */}
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
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                        <p className="text-white leading-tight font-light" style={{ fontSize: '28px' }}>
                            {getC('intro', 'quote', "La Fundación Rotaria transforma tus contribuciones en proyectos de servicio que cambian vidas en nuestras comunidades locales y en todo el mundo.")}
                        </p>
                    </div>
                </section>

                {/* 3. Contenedor de Textos Misión e Impacto */}
                <section className="py-20 md:py-28 bg-rotary-concrete">
                    <div className="max-w-4xl mx-auto px-6 text-gray-800">
                        {/* Header Text Centered */}
                        <div className="mb-12">
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

                {/* 4. Carrusel de Impacto */}
                <FoundationImpactCarousel />

                {/* 5. Contenedor de Estadísticas (Infogram Embeds) */}
                <section className="py-20 md:py-24 bg-rotary-concrete">
                    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
                        {/* Embed 1 */}
                        <div className="infogram-embed w-full" data-id="8429f8ab-b085-44b2-8d70-285b0ac5935a" data-type="interactive" data-title="ES: Rotary Grants 2021-22"></div>
                        
                        {/* Embed 2 */}
                        <div className="infogram-embed w-full" data-id="bfbb9326-ffcb-40fa-9781-b6af7ce02350" data-type="interactive" data-title="ES: Global Grants by AOF 2021"></div>
                    </div>
                </section>

                {/* 6. Métricas e Impacto (Clonado de Maneras de Contribuir) */}
                <FoundationImpactSection />

            </main>

            <Footer />
        </div>
    );
};

export default FundacionRotaria;
