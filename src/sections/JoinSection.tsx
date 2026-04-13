import { Star } from 'lucide-react';
import { useSiteImages } from '../hooks/useSiteImages';
import { useClub } from '../contexts/ClubContext';

const DEFAULT_JOIN_IMG = 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=600&h=500&fit=crop';

const JoinSection = () => {
  const { club } = useClub();
  const siteImages = useSiteImages();
  const isLatir = club?.subdomain?.toLowerCase().includes('latir') || club?.name?.toLowerCase().includes('latir');

  const imgUrl = siteImages.join?.url || DEFAULT_JOIN_IMG;
  const imgAlt = siteImages.join?.alt || 'Rotary Members';

  return (
    <section className="py-20" style={{ backgroundColor: '#0C3C7C' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* Text Content */}
          <div className="text-white space-y-8">
            {isLatir ? (
              <>
                <h2 className="text-4xl md:text-5xl font-black mb-6 leading-[1.15] tracking-tight">
                  ¡Únete a LATIR y transforma el mundo, un intercambio a la vez!
                </h2>
                <div className="space-y-6">
                  <p className="text-lg text-white/90 leading-relaxed font-medium">
                    Construyamos juntos un futuro de servicio, liderazgo y amistad, donde la juventud es protagonista del cambio y la diversidad nuestra mayor fortaleza. Resolver los desafíos más urgentes de nuestra región y del mundo requiere visión, acción y unión. En **LATIR**, creemos que cada joven tiene el poder de generar impacto a través del entendimiento cultural y el servicio voluntario.
                  </p>
                  <p className="text-xl font-bold leading-relaxed pt-4">
                    Conectamos a 44 distritos de 14 países, inspirando a más de 175 participantes a LATIR juntos por un futuro de paz y cooperación.
                  </p>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-3xl md:text-4xl font-light mb-6 leading-tight">
                  Únete a Rotary y construyamos juntos un futuro de servicio y amistad, impulsando el cambio y la solidaridad en el mundo
                </h2>
                <p className="text-white/80 mb-8 leading-relaxed">
                  Resolver algunos de los problemas más complejos y acuciantes del mundo requiere compromiso y visión. Los socios de Rotary creen que compartimos la responsabilidad de tomar acción para mejorar nuestras comunidades. Únete a nosotros, para que juntos podamos tener un impacto aún mayor.
                </p>
              </>
            )}
            
            <button
              className="mt-6 inline-flex items-center gap-2 bg-white hover:bg-gray-100 text-[#0C3C7C] font-bold px-10 py-4 rounded-2xl transition-all duration-300 shadow-xl active:scale-95"
            >
              <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
              Involúcrate en Rotary
            </button>
          </div>

          {/* Image */}
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-yellow-400 to-[#FAA51A] rounded-[40px] blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200"></div>
            <img
              src={imgUrl}
              alt={imgAlt}
              className="relative rounded-[40px] shadow-2xl w-full h-auto object-cover aspect-[4/3]"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default JoinSection;
