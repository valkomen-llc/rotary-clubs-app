import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';

const Interact = () => {
    const { club } = useClub();
    const { sections } = useCMSContent('interact', club.id);

    const getC = (section: string, field: string, fallback: string) => {
        return sections[section]?.[field] || fallback;
    }

    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Hero Section */}
            <section className="relative w-full h-[350px] md:h-[450px] overflow-hidden">
                <div className="absolute inset-0">
                    <img
                        src={getC('hero', 'image', "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1600&h=600&fit=crop")}
                        alt="Interact"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30" />
                </div>
            </section>

            {/* Title Section */}
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
                    <h1 className="text-3xl md:text-4xl font-bold text-white tracking-wider">
                        {getC('header', 'title', `Interact ${club.name}`)}
                    </h1>
                </div>
            </section>

            {/* Content Section */}
            <section className="py-16 md:py-24 bg-rotary-concrete">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <p className="text-xl md:text-2xl text-gray-700 leading-relaxed font-light">
                            {getC('intro', 'text', "Interact es un club de servicio para jóvenes de 12 a 18 años que quieren conectarse con otros jóvenes de su comunidad o escuela y divertirse mientras sirven.")}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-16">
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 border-t-4 border-t-rotary-blue">
                            <h2 className="text-2xl font-bold text-rotary-blue mb-4">
                                {getC('section1', 'title', "¿Qué es Interact?")}
                            </h2>
                            <p className="text-gray-600 leading-relaxed">
                                {getC('section1', 'content', "Los clubes Interact organizan al menos dos proyectos de servicio cada año: uno que beneficie a su escuela o comunidad y otro que fomente la comprensión internacional.")}
                            </p>
                        </div>
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 border-t-4 border-t-rotary-gold">
                            <h2 className="text-2xl font-bold text-rotary-blue mb-4">
                                {getC('section2', 'title', "Liderazgo Joven")}
                            </h2>
                            <p className="text-gray-600 leading-relaxed">
                                {getC('section2', 'content', "Los socios de Interact desarrollan sus habilidades de liderazgo y descubren el poder del 'Dar de sí antes de pensar en sí'.")}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default Interact;
