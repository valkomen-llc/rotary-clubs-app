import { Star, Award } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';

const NuestraJuntaDirectiva = () => {
  const { club } = useClub();
  const { sections } = useCMSContent('junta-directiva', club.id);

  const getC = (section: string, field: string, fallback: string) => {
    return sections[section]?.[field] || fallback;
  }

  const defaultJunta = [
    {
      id: 1,
      nombre: 'Ricardo Jaramillo',
      cargo: 'Presidente',
      profesion: 'Past RDR 2008–2009',
      imagen: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face'
    },
    {
      id: 2,
      nombre: 'Andrés Patiño',
      cargo: 'Vicepresidente',
      profesion: 'Past RDR 2009–2010',
      imagen: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face'
    }
  ];

  const juntaDirectiva = sections['list']?.items || defaultJunta;

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
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            {getC('header', 'title', "Nuestra Junta Directiva")}
          </h1>
          <p className="text-white/90 text-lg max-w-2xl mx-auto">
            {getC('header', 'description', "Conoce a los líderes que guían nuestro club con dedicación, visión y compromiso con los valores de Rotary.")}
          </p>
        </div>
      </section>

      {/* Junta Directiva Grid */}
      <section className="py-12 md:py-16 bg-rotary-concrete">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {juntaDirectiva.map((miembro: any, i: number) => (
              <div
                key={i}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow flex"
              >
                <div className="w-32 h-32 md:w-40 md:h-40 flex-shrink-0">
                  <img
                    src={miembro.imagen}
                    alt={miembro.nombre}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="p-4 md:p-6 flex flex-col justify-center">
                  <div className="flex items-center gap-2 mb-1">
                    <Award className="w-4 h-4 text-rotary-gold" />
                    <span className="text-rotary-blue font-semibold text-sm uppercase tracking-wide">
                      {miembro.cargo}
                    </span>
                  </div>
                  <h3 className="text-lg md:text-xl font-bold text-gray-800 mb-2">
                    {miembro.nombre}
                  </h3>
                  <p className="text-gray-600 text-sm md:text-base">
                    {miembro.profesion}
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
            {getC('cta', 'title', "¿Quieres ser parte de nuestro equipo de liderazgo?")}
          </h2>
          <button
            className="inline-flex items-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
          >
            <Star className="w-5 h-5 text-rotary-gold fill-rotary-gold" />
            {getC('cta', 'buttonText', "Contáctanos")}
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default NuestraJuntaDirectiva;
