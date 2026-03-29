import { Star } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';

const NuestrosSocios = () => {
  const { club } = useClub();
  const { sections } = useCMSContent('nuestros-socios', club.id);

  const getC = (section: string, field: string, fallback: string) => {
    return sections[section]?.[field] || fallback;
  }

  const defaultSocios = [
    {
      id: 1,
      nombre: 'Luis A. Malo',
      profesion: 'Profesional en Gobierno y Relaciones Internacionales',
      imagen: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face'
    },
    {
      id: 2,
      nombre: 'Yaneth Echeverría',
      profesion: 'Independiente',
      imagen: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face'
    }
  ];

  const socios = sections['list']?.items || defaultSocios;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Hero Section */}
      <section
        className="py-16 md:py-20"
        style={{
          backgroundColor: '#0c3c7c',
          backgroundImage: "url('/geo-darkblue.png')",
          backgroundPosition: '50% 0',
          backgroundRepeat: 'repeat',
          backgroundSize: '71px 85px'
        }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-light text-white mb-6">
            {getC('header', 'title', "Nuestros Socios")}
          </h1>
          <p className="text-white/90 text-lg max-w-2xl mx-auto">
            {getC('header', 'description', "Los líderes de Rotary reflejan las cualidades que hacen de nuestros socios personas extraordinarias.")}
          </p>
        </div>
      </section>

      {/* Socios Grid */}
      <section className="py-12 md:py-16 bg-rotary-concrete">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center gap-8">
            {socios.map((socio: any, i: number) => (
              <div
                key={i}
                className="w-full sm:w-[calc(50%-1rem)] lg:w-[calc(33.333%-1.5rem)] xl:w-[calc(25%-1.5rem)] bg-white rounded-2xl shadow-xl overflow-hidden hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 flex flex-col group border border-gray-100"
              >
                <div className="w-full aspect-square overflow-hidden relative">
                  <div className="absolute inset-0 bg-rotary-navy/10 group-hover:bg-transparent transition-colors z-10 pointer-events-none"></div>
                  <img
                    src={socio.imagen}
                    alt={socio.nombre}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                  />
                </div>

                <div className="p-6 md:p-8 flex flex-col flex-grow text-center bg-white">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {socio.nombre}
                  </h3>
                  <p className="text-rotary-blue font-medium text-sm md:text-base leading-relaxed">
                    {socio.profesion}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 md:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-rotary-blue mb-6">
            {getC('cta', 'title', "¿Quieres escribir la historia con nosotros?")}
          </h2>
          <button
            className="inline-flex items-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
          >
            <Star className="w-5 h-5 text-rotary-gold fill-rotary-gold" />
            {getC('cta', 'buttonText', "Involúcrate en Rotary")}
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default NuestrosSocios;
