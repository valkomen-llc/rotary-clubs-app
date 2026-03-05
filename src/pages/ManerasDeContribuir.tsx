import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { Heart } from 'lucide-react';

const ManerasDeContribuir = () => {
    return (
        <div className="min-h-screen bg-white">
            <Navbar />

            {/* Top Centered Title & Description */}
            <section className="pt-32 pb-16 bg-rotary-concrete">
                <div className="max-w-4xl mx-auto px-4 text-center">
                    <h1 className="text-4xl md:text-6xl font-light text-rotary-blue mb-8">Maneras de contribuir</h1>
                    <p className="text-gray-600 text-lg md:text-xl leading-relaxed max-w-3xl mx-auto">
                        Una contribución a Rotary significa agua potable y saneamiento, salud y esperanza en zonas asoladas por enfermedades como la polio, así como desarrollo económico y nuevas oportunidades. Gracias a tu generosidad podemos hacer esto y mucho más.
                    </p>
                </div>
            </section>

            {/* Hero Section with Donation Card */}
            <section className="relative w-full h-[500px] md:h-[600px] overflow-hidden flex items-center">
                <div className="absolute inset-0">
                    <img
                        src="https://www.rotary.org/sites/default/files/styles/w_2800/public/Donate-hero-w2800x975-1.jpg?itok=PDJdtKJ9"
                        alt="Maneras de contribuir"
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-white/10" />
                </div>

                <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex justify-center lg:justify-end">
                    {/* Donation Card */}
                    <div className="bg-white rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] p-10 max-w-md w-full border border-gray-50/50 mr-0 lg:mr-8 transform hover:-translate-y-1 transition-transform duration-300">
                        <h2 className="text-[26px] font-bold text-gray-800 text-center mb-6 leading-tight">Aporte voluntario al Club</h2>
                        <p className="text-gray-600 text-[15px] text-center mb-10 leading-relaxed px-2">
                            Tu contribución fortalece el impacto de nuestro club,
                            apoya nuestras actividades institucionales y
                            sostiene iniciativas de servicio que transforman
                            vidas en nuestra comunidad.
                        </p>
                        <button className="w-full bg-[#9D2235] hover:bg-[#8B1E2F] text-white font-bold py-[18px] rounded-lg flex items-center justify-center gap-3 transition-colors uppercase tracking-widest text-[13px]">
                            <Heart className="w-5 h-5 fill-current" />
                            APORTAR
                        </button>
                    </div>
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default ManerasDeContribuir;
