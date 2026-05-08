import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const impactData = [
  {
    id: 1,
    image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=400&h=250&fit=crop',
    title: 'UNA LABOR DE AMOR',
    description: '"Gracias a una subvención de 2 millones de dólares de los Programas de Gran Escala de Rotary, un proyecto ofrece atención de alta calidad a mujeres embarazadas, madres y recién nacidos en Nigeria."',
    color: 'bg-emerald-600',
    link: 'https://www.rotary.org/es/labor-love'
  },
  {
    id: 2,
    image: 'https://images.unsplash.com/photo-1588072432836-e10032774350?w=400&h=250&fit=crop',
    title: 'AULAS PREPARADAS PARA EL ÉXITO',
    description: '"Para cerrar la brecha digital en Panamá, comenzaron con los docentes."',
    color: 'bg-rotary-blue',
    link: 'https://www.rotary.org/es/classrooms-wired-success'
  },
  {
    id: 3,
    image: 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=400&h=250&fit=crop',
    title: 'TURQUÍA RENACE DE SUS CENIZAS',
    description: '"Tras los dos fuertes terremotos que sacudieron Turquía, las labores de socorro de Rotary siguen siendo una vía de salida de entre los escombros."',
    color: 'bg-rose-700',
    link: 'https://www.rotary.org/es/rising-ruins-turkey'
  }
];

const FoundationImpactCarousel = () => {
  const [currentIndex, setCurrentIndex] = useState(1);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? impactData.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === impactData.length - 1 ? 0 : prev + 1));
  };

  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(() => {
      goToNext();
    }, 5000);
    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  const getVisibleCards = () => {
    const prev = currentIndex === 0 ? impactData.length - 1 : currentIndex - 1;
    const next = currentIndex === impactData.length - 1 ? 0 : currentIndex + 1;
    return [impactData[prev], impactData[currentIndex], impactData[next]];
  };

  const visibleCards = getVisibleCards();

  return (
    <section className="py-16 md:py-20 bg-rotary-geo">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className="relative flex items-center justify-center"
          onMouseEnter={() => setIsAutoPlaying(false)}
          onMouseLeave={() => setIsAutoPlaying(true)}
        >
          {/* Left Arrow */}
          <button
            onClick={goToPrevious}
            className="absolute left-0 z-10 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-6 h-6 text-gray-700" />
          </button>

          {/* Cards Container */}
          <div key={currentIndex} className="flex items-center justify-center gap-4 md:gap-12 py-8 animate-fade-in w-full">
            {visibleCards.map((item, index) => {
              const isCenter = index === 1;
              return (
                <div
                  key={item.id}
                  className={`
                    rounded-2xl overflow-hidden shadow-xl transition-all duration-500 flex flex-col
                    ${isCenter ? 'w-72 md:w-[400px] scale-110 z-10' : 'hidden md:flex w-64 md:w-80 scale-90 opacity-70'}
                  `}
                >
                  {/* Image */}
                  <a href={item.link} target="_blank" rel="noopener noreferrer" className="block h-40 md:h-48 overflow-hidden">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  </a>

                  {/* Title Bar */}
                  <div className={`${item.color} py-3 px-4`}>
                    <h3 className="text-white text-xs md:text-sm font-bold text-center uppercase tracking-wider">
                      {item.title}
                    </h3>
                  </div>

                  {/* Description */}
                  <div className={`${isCenter ? 'bg-white' : 'bg-white/80'} p-4 md:p-6 flex-1 flex flex-col justify-center`}>
                    <p className={`text-gray-600 text-sm text-center italic leading-relaxed ${isCenter ? '' : 'text-xs'}`}>
                      {item.description}
                    </p>
                    {isCenter && (
                      <div className="mt-4 text-center">
                        <a 
                          href={item.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#0099cc] hover:text-[#007ba3] font-bold text-xs uppercase tracking-wider inline-block"
                        >
                          MÁS INFORMACIÓN
                        </a>
                      </div>
                    )}
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
          {impactData.map((_, index) => (
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

export default FoundationImpactCarousel;
