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

  // Logic: 
  // 1. Check if club has members in database (priority)
  // 2. Fallback to CMS sections if configured
  // 3. Absolute fallback to defaultJunta
  const dbBoardMembers = (club.members || [])
    .filter((m: any) => m.isBoard)
    .map((m: any) => ({
        id: m.id,
        nombre: m.name,
        cargo: m.boardRole || 'Directivo',
        profesion: m.description || '',
        imagen: m.image || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face'
    }));

  const juntaDirectiva = dbBoardMembers.length > 0 
    ? dbBoardMembers 
    : (sections['list']?.items || defaultJunta);

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
            {getC('header', 'title', "Nuestra Junta Directiva")}
          </h1>
          <p className="text-white/90 text-lg max-w-2xl mx-auto">
            {getC('header', 'description', "Conoce a los líderes que guían nuestro club con dedicación, visión y compromiso con los valores de Rotary.")}
          </p>
        </div>
      </section>

      {/* Junta Directiva Grid */}
      <section className="py-12 md:py-16 bg-rotary-concrete">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center gap-8">
            {juntaDirectiva.map((miembro: any, i: number) => (
              <div
                key={i}
                className="w-full sm:w-[calc(50%-1rem)] lg:w-[calc(33.333%-1.5rem)] xl:w-[calc(25%-1.5rem)] bg-white rounded-2xl shadow-xl overflow-hidden hover:-translate-y-2 hover:shadow-2xl transition-all duration-300 flex flex-col group border border-gray-100 relative"
              >
                {/* Image Section */}
                <div className="w-full aspect-square overflow-hidden relative">
                  <div className="absolute inset-0 bg-rotary-navy/10 group-hover:bg-transparent transition-colors z-10 pointer-events-none"></div>
                  <img
                    src={miembro.imagen}
                    alt={miembro.nombre}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                  />
                {/* Content Section */}
                <div className="p-6 md:p-8 flex flex-col flex-grow text-center bg-white">
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    {miembro.nombre}
                  </h3>
                  <p className="text-gray-500 font-medium text-sm md:text-base leading-relaxed mb-4">
                    {miembro.profesion}
                  </p>
                  
                  {/* Cargo Badge placed below profession */}
                  <div className="mt-auto flex justify-center">
                    <div className="bg-sky-50 px-4 py-1.5 rounded-full border border-sky-100 flex items-center gap-2">
                      <Award className="w-3.5 h-3.5 text-rotary-blue" />
                      <span className="text-rotary-blue font-black text-[10px] uppercase tracking-widest">
                        {miembro.cargo}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 md:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl text-rotary-blue mb-6">
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
