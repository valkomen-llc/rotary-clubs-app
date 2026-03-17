import { Star } from 'lucide-react';
import { useSiteImages } from '../hooks/useSiteImages';

const DEFAULT_JOIN_IMG = 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=600&h=500&fit=crop';

const JoinSection = () => {
  const siteImages = useSiteImages();
  const imgUrl = siteImages.join?.url || DEFAULT_JOIN_IMG;
  const imgAlt = siteImages.join?.alt || 'Rotary Members';
  return (
    <section className="py-16 md:py-20" style={{ backgroundColor: '#0c3c7c' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Text Content */}
          <div className="text-white">
            <h2 className="text-3xl md:text-4xl font-light mb-6 leading-tight">
              Únete a Rotary y construyamos juntos un futuro de servicio y amistad, impulsando el cambio y la solidaridad en el mundo
            </h2>
            <p className="text-white/80 mb-8 leading-relaxed">
              Resolver algunos de los problemas más complejos y acuciantes del mundo requiere compromiso y visión. Los socios de Rotary creen que compartimos la responsabilidad de tomar acción para mejorar nuestras comunidades. Únete a nosotros, para que juntos podamos tener un impacto aún mayor.
            </p>
            <button
              className="inline-flex items-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
            >
              <Star className="w-5 h-5 text-rotary-gold fill-rotary-gold" />
              Involúcrate en Rotary
            </button>
          </div>

          {/* Image */}
          <div className="relative">
            <img
              src={imgUrl}
              alt={imgAlt}
              className="rounded-lg shadow-xl w-full h-auto object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default JoinSection;
