import { Star, Award } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

const juntaDirectiva = [
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
  },
  {
    id: 3,
    nombre: 'Lucas Lasso',
    cargo: 'Secretario',
    profesion: 'Past RDR 2010–2011',
    imagen: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop&crop=face'
  },
  {
    id: 4,
    nombre: 'Israel David Castellanos',
    cargo: 'Tesorero',
    profesion: 'Past RDR 2011–2012',
    imagen: 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?w=200&h=200&fit=crop&crop=face'
  },
  {
    id: 5,
    nombre: 'Luz Adriana Bermúdez',
    cargo: 'Directora de Proyectos',
    profesion: 'Past RDR 2012–2013',
    imagen: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop&crop=face'
  },
  {
    id: 6,
    nombre: 'Natalia Giraldo',
    cargo: 'Directora de Membresía',
    profesion: 'Líder en Desarrollo Comunitario',
    imagen: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop&crop=face'
  },
  {
    id: 7,
    nombre: 'Leidy Viviana Hurtado',
    cargo: 'Directora de Comunicaciones',
    profesion: 'Especialista en Relaciones Públicas',
    imagen: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&crop=face'
  }
];

const NuestraJuntaDirectiva = () => {
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
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">Nuestra Junta Directiva</h1>
          <p className="text-white/90 text-lg max-w-2xl mx-auto">
            Conoce a los líderes que guían nuestro club con dedicación, visión y compromiso con los valores de Rotary.
          </p>
        </div>
      </section>

      {/* Junta Directiva Grid */}
      <section className="py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {juntaDirectiva.map((miembro) => (
              <div
                key={miembro.id}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow flex"
              >
                {/* Image */}
                <div className="w-32 h-32 md:w-40 md:h-40 flex-shrink-0">
                  <img
                    src={miembro.imagen}
                    alt={miembro.nombre}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Content */}
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
            ¿Quieres ser parte de nuestro equipo de liderazgo?
          </h2>
          <button
            className="inline-flex items-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
          >
            <Star className="w-5 h-5 text-rotary-gold fill-rotary-gold" />
            Contáctanos
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default NuestraJuntaDirectiva;
