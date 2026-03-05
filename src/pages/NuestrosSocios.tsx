import { Star } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

const socios = [
  {
    id: 1,
    nombre: 'Luis A. Malo',
    profesion: 'Profesional en Gobierno y Relaciones Internacionales / Administrador de Empresas',
    imagen: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop&crop=face'
  },
  {
    id: 2,
    nombre: 'Yaneth Echeverría',
    profesion: 'Independiente',
    imagen: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face'
  },
  {
    id: 3,
    nombre: 'Edna Lucía Vinasco Ramírez',
    profesion: 'Enfermera',
    imagen: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face'
  },
  {
    id: 4,
    nombre: 'Mélida Valencia',
    profesion: 'Contadora',
    imagen: 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=200&h=200&fit=crop&crop=face'
  },
  {
    id: 5,
    nombre: 'Daniel Yazo',
    profesion: 'Ingeniero / Empresario',
    imagen: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face'
  },
  {
    id: 6,
    nombre: 'Fredy Giraldo Lozano',
    profesion: 'Ingeniero Civil',
    imagen: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face'
  },
  {
    id: 7,
    nombre: 'Andrés Felipe Gartner Trejos',
    profesion: 'Abogado',
    imagen: 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=200&h=200&fit=crop&crop=face'
  },
  {
    id: 8,
    nombre: 'Angela Arango',
    profesion: 'Ingeniera Agroindustrial – Magíster en Ingeniería con especialidad en calidad y productividad',
    imagen: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&crop=face'
  },
  {
    id: 9,
    nombre: 'Luis Guillermo Martínez',
    profesion: 'Ingeniería Ambiental',
    imagen: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&h=200&fit=crop&crop=face'
  },
  {
    id: 10,
    nombre: 'Juan Carlos Molina',
    profesion: 'Ingeniero / Empresario',
    imagen: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200&h=200&fit=crop&crop=face'
  }
];

const NuestrosSocios = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Hero Section */}
      <section
        className="py-16 md:py-20"
        style={{
          backgroundColor: '#263b4c',
          backgroundImage: "url('/geo-darkblue.png')",
          backgroundPosition: '50% 0',
          backgroundRepeat: 'repeat',
          backgroundSize: '71px 85px'
        }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Nuestros Socios</h1>
          <p className="text-white/90 text-lg max-w-2xl mx-auto">
            Los líderes de Rotary reflejan las cualidades que hacen de nuestros socios personas extraordinarias: integridad, competencia y dedicación al servicio.
          </p>
        </div>
      </section>

      {/* Socios Grid */}
      <section className="py-12 md:py-16 bg-rotary-concrete">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {socios.map((socio) => (
              <div
                key={socio.id}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow flex"
              >
                {/* Image */}
                <div className="w-32 h-32 md:w-40 md:h-40 flex-shrink-0">
                  <img
                    src={socio.imagen}
                    alt={socio.nombre}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Content */}
                <div className="p-4 md:p-6 flex flex-col justify-center">
                  <h3 className="text-lg md:text-xl font-bold text-gray-800 mb-2">
                    {socio.nombre}
                  </h3>
                  <p className="text-gray-600 text-sm md:text-base">
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
            ¿Quieres escribir la historia con nosotros?
          </h2>
          <button
            className="inline-flex items-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
          >
            <Star className="w-5 h-5 text-rotary-gold fill-rotary-gold" />
            Involúcrate en Rotary
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default NuestrosSocios;
