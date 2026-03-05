import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

const FundacionRotaria = () => {
    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Hero Section - Impact Image */}
            <section className="relative w-full h-[350px] md:h-[450px] overflow-hidden">
                <div className="absolute inset-0">
                    <img
                        src="https://images.unsplash.com/photo-1532629345422-7515f3d16bb6?w=1600&h=600&fit=crop"
                        alt="La Fundación Rotaria"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30" />
                </div>
            </section>

            {/* Title Section - Blue Background */}
            <section
                className="py-12 md:py-16"
                style={{
                    backgroundColor: '#263b4c',
                    backgroundImage: "url('/geo-darkblue.png')",
                    backgroundPosition: '50% 0',
                    backgroundRepeat: 'repeat',
                    backgroundSize: '71px 85px'
                }}
            >
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                    <h1 className="text-3xl md:text-4xl font-bold text-white tracking-wider">Nuestra Fundación Rotaria</h1>
                </div>
            </section>

            {/* Content Section */}
            <section className="py-16 md:py-24 bg-rotary-concrete">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <p className="text-xl md:text-2xl text-gray-700 leading-relaxed font-light">
                            La Fundación Rotaria transforma tus contribuciones en proyectos de servicio que cambian vidas, tanto en tu propia comunidad como en todo el mundo.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-16">
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                            <h2 className="text-2xl font-bold text-rotary-blue mb-4">Misión</h2>
                            <p className="text-gray-600 leading-relaxed">
                                La misión de La Fundación Rotaria es permitir que los rotarios promuevan la comprensión mundial, la buena voluntad y la paz a través del mejoramiento de la salud, el apoyo a la educación y la mitigación de la pobreza.
                            </p>
                        </div>
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                            <h2 className="text-2xl font-bold text-rotary-blue mb-4">Impacto Global</h2>
                            <p className="text-gray-600 leading-relaxed">
                                Desde su fundación hace más de 100 años, la Fundación ha invertido más de 4,000 millones de dólares en proyectos de servicio sostenibles.
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
