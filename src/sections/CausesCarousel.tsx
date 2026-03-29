import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useSiteImages } from '../hooks/useSiteImages';

const defaultCauses = [
  {
    id: 1,
    image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=250&fit=crop',
    title: 'PROTEGEMOS EL MEDIO AMBIENTE',
    description: '"Trabajamos en proyectos para preservar nuestros recursos naturales y combatir el impacto del cambio climático."',
    color: 'bg-emerald-600'
  },
  {
    id: 2,
    image: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=400&h=250&fit=crop',
    title: 'SOMOS GENTE DE ACCIÓN',
    description: '"Nuestra red mundial de vecinos, amigos y líderes voluntarios ofrecen sus conocimientos y recursos para resolver problemas y abordar las necesidades de las comunidades."',
    color: 'bg-rotary-blue'
  },
  {
    id: 3,
    image: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=400&h=250&fit=crop',
    title: 'PROMOVEMOS LA PAZ',
    description: '"Fomentamos la paz en el mundo a través de programas de intercambio, becas y proyectos que abordan las causas de los conflictos."',
    color: 'bg-rose-700'
  },
  {
    id: 4,
    image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&h=250&fit=crop',
    title: 'COMBATIMOS ENFERMEDADES',
    description: '"Trabajamos para prevenir y tratar enfermedades, mejorar el acceso a la atención médica y promover la salud en comunidades de todo el mundo."',
    color: 'bg-purple-700'
  },
  {
    id: 5,
    image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=400&h=250&fit=crop',
    title: 'PROTEGEMOS A MADRES E HIJOS',
    description: '"Apoyamos programas que mejoran la salud materna e infantil, reduciendo la mortalidad y promoviendo el bienestar familiar."',
    color: 'bg-pink-600'
  }
];

const CausesCarousel = () => {
  const siteImages = useSiteImages();
  const [currentIndex, setCurrentIndex] = useState(1);

  // Override images with custom aboutCarousel images from admin
  const causes = defaultCauses.map((cause, i) => ({
    ...cause,
    image: siteImages.aboutCarousel?.[i]?.url || cause.image,
  }));

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? causes.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === causes.length - 1 ? 0 : prev + 1));
  };

  const getVisibleCards = () => {
    const prev = currentIndex === 0 ? causes.length - 1 : currentIndex - 1;
    const next = currentIndex === causes.length - 1 ? 0 : currentIndex + 1;
    return [causes[prev], causes[currentIndex], causes[next]];
  };

  const visibleCards = getVisibleCards();

  return (
    <section className="py-16 md:py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative flex items-center justify-center">
          {/* Left Arrow */}
          <button
            onClick={goToPrevious}
            className="absolute left-0 z-10 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>

          {/* Cards Container */}
          <div className="flex items-center justify-center gap-4 md:gap-12 py-8">
            {visibleCards.map((cause, index) => {
              const isCenter = index === 1;
              return (
                <div
                  key={cause.id}
                  className={`
                    rounded-2xl overflow-hidden shadow-xl transition-all duration-500
                    ${isCenter ? 'w-72 md:w-[400px] scale-110 z-10' : 'w-64 md:w-80 scale-90 opacity-70'}
                  `}
                >
                  {/* Image */}
                  <div className="h-40 md:h-48 overflow-hidden">
                    <img
                      src={cause.image}
                      alt={cause.title}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Title Bar */}
                  <div className={`${cause.color} py-3 px-4`}>
                    <h3 className="text-white text-xs md:text-sm font-bold text-center uppercase tracking-wider">
                      {cause.title}
                    </h3>
                  </div>

                  {/* Description */}
                  <div className={`${isCenter ? 'bg-white' : 'bg-white/80'} p-4 md:p-6`}>
                    <p className={`text-gray-600 text-sm text-center italic leading-relaxed ${isCenter ? '' : 'text-xs'}`}>
                      {cause.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Arrow */}
          <button
            onClick={goToNext}
            className="absolute right-0 z-10 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="w-6 h-6 text-gray-700" />
          </button>
        </div>

        {/* Dots Indicator */}
        <div className="flex justify-center gap-2 mt-6">
          {causes.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentIndex(index)}
              className={`
                w-2.5 h-2.5 rounded-full transition-all
                ${index === currentIndex ? 'bg-white w-6' : 'bg-white/50'}
              `}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default CausesCarousel;
