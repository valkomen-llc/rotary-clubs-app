import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

const Rotaract = () => {
    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Hero Section - Impact Image */}
            <section className="relative w-full h-[350px] md:h-[450px] overflow-hidden">
                <div className="absolute inset-0">
                    <img
                        src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&h=600&fit=crop"
                        alt="Rotaract"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/30" />
                </div>
            </section>

            {/* Title Section - Blue Background */}
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
                    <h1 className="text-3xl md:text-4xl font-bold text-white tracking-wider">Rotaract</h1>
                </div>
            </section>

            {/* Content Section */}
            <section className="py-16 md:py-24 bg-rotary-concrete">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <p className="text-xl md:text-2xl text-gray-700 leading-relaxed font-light">
                            Los clubes Rotaract ofrecen a personas de 18 años en adelante la oportunidad de intercambiar ideas con los líderes de la comunidad, adquirir habilidades profesionales y de liderazgo y, sobre todo, servir y divertirse.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mt-16">
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                            <h2 className="text-2xl font-bold text-rotary-blue mb-4">¿Qué es Rotaract?</h2>
                            <p className="text-gray-600 leading-relaxed">
                                Rotaract es una organización internacional de clubes de servicio para jóvenes, hombres y mujeres, que desean marcar la diferencia en sus comunidades y en el mundo.
                            </p>
                        </div>
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
                            <h2 className="text-2xl font-bold text-rotary-blue mb-4">Nuestro Impacto</h2>
                            <p className="text-gray-600 leading-relaxed">
                                A través de proyectos de servicio local e internacional, los socios de Rotaract ayudan a mejorar la vida de los demás, mientras desarrollan sus propias habilidades de liderazgo.
                            </p>
                        </div>
                    </div>
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default Rotaract;
