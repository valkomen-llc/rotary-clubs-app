import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';

const FundacionRotaria = () => {
    const { club } = useClub();
    const { sections } = useCMSContent('fundacion-rotaria', club.id);

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
                        src={getC('hero', 'image', "https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=1600&h=600&fit=crop")}
                        alt="La Fundación Rotaria"
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
                        {getC('header', 'title', "La Fundación Rotaria")}
                    </h1>
                </div>
            </section>

            {/* Content Section */}
            <section className="py-16 md:py-24 bg-rotary-concrete">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <p className="text-xl md:text-2xl text-gray-700 leading-relaxed font-light">
                            {getC('intro', 'text', "La Fundación Rotaria transforma tus contribuciones en proyectos de servicio que cambian vidas, tanto en tu propia comunidad como en todo el mundo.")}
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-16">
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 border-t-4 border-t-rotary-blue">
                            <h2 className="text-2xl font-bold text-rotary-blue mb-4">
                                {getC('section1', 'title', "Misión")}
                            </h2>
                            <p className="text-gray-600 leading-relaxed">
                                {getC('section1', 'content', "La misión de La Fundación Rotaria es permitir que los rotarios promuevan la comprensión mundial, la buena voluntad y la paz.")}
                            </p>
                        </div>
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100 border-t-4 border-t-rotary-gold">
                            <h2 className="text-2xl font-bold text-rotary-blue mb-4">
                                {getC('section2', 'title', "Impacto Global")}
                            </h2>
                            <p className="text-gray-600 leading-relaxed">
                                {getC('section2', 'content', "Desde su fundación hace más de 100 años, la Fundación ha invertido más de 4,000 millones de dólares en proyectos sostenibles.")}
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default FundacionRotaria;
