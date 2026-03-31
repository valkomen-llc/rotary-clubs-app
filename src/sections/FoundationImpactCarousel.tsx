import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const impactData = [
  {
    id: 1,
    image: 'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=600&h=400&fit=crop',
    title: 'UNA LABOR DE AMOR',
    description: 'Gracias a una subvención de 2 millones de dólares de los Programas de Gran Escala de Rotary, un proyecto ofrece atención de alta calidad a mujeres embarazadas, madres y recién nacidos en Nigeria.',
    color: 'bg-[#008998]',
    link: 'https://www.rotary.org/es/labor-love'
  },
  {
    id: 2,
    image: 'https://images.unsplash.com/photo-1588072432836-e10032774350?w=600&h=400&fit=crop',
    title: 'AULAS PREPARADAS PARA EL ÉXITO',
    description: 'Para cerrar la brecha digital en Panamá, comenzaron con los docentes.',
    color: 'bg-[#9e1b32]',
    link: 'https://www.rotary.org/es/classrooms-wired-success'
  },
  {
    id: 3,
    image: 'https://images.unsplash.com/photo-1469571486292-0ba58a3f068b?w=600&h=400&fit=crop',
    title: 'TURQUÍA RENACE DE SUS CENIZAS',
    description: 'Tras los dos fuertes terremotos que sacudieron Turquía, las labores de socorro de Rotary siguen siendo una vía de salida de entre los escombros.',
    color: 'bg-[#008cb3]',
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

  // Auto-play carousel every 5 seconds
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
    <section className="py-16 md:py-24 overflow-hidden relative" style={{ backgroundImage: "url('/geo-concrete.png')", backgroundRepeat: 'repeat' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Titulo superior */}
        <h2 className="text-center text-lg md:text-xl font-bold text-gray-600 tracking-widest uppercase mb-16">
            CÓMO LA FUNDACIÓN LLEVA AYUDA A LOS NECESITADOS
        </h2>

        <div
          className="relative flex items-center justify-center"
          onMouseEnter={() => setIsAutoPlaying(false)}
          onMouseLeave={() => setIsAutoPlaying(true)}
        >
          {/* Left Arrow */}
          <button
            onClick={goToPrevious}
            className="absolute left-0 lg:-left-4 z-20 w-12 h-12 bg-transparent lg:bg-white rounded-full lg:shadow-md flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-8 h-8 text-gray-500 hover:text-gray-800 transition-colors" strokeWidth={1.5} />
          </button>

          {/* Cards Container */}
          <div key={currentIndex} className="flex items-center justify-center gap-2 md:gap-8 animate-fade-in w-full">
            {visibleCards.map((item, index) => {
              const isCenter = index === 1;
              return (
                <div
                  key={item.id}
                  className={`
                    flex flex-col
                    overflow-hidden shadow-2xl transition-all duration-500
                    ${isCenter ? 'w-full md:w-[420px] scale-105 z-10 block' : 'hidden md:flex w-64 md:w-80 scale-95 opacity-60 hover:opacity-100 cursor-pointer'}
                  `}
                  onClick={() => !isCenter && (index === 0 ? goToPrevious() : goToNext())}
                >
                  {/* Image */}
                  <div className="h-48 md:h-64 overflow-hidden">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Title Bar */}
                  <div className={`${item.color} py-3 px-6 flex items-center justify-center min-h-[64px]`}>
                    <h3 className="text-white text-[13px] md:text-sm font-bold text-center tracking-wider uppercase">
                      {item.title}
                    </h3>
                  </div>

                  {/* Description */}
                  <div className="bg-[#dadada] flex-1 p-6 md:p-8 flex flex-col justify-between">
                    <p className="text-gray-800 text-[15px] leading-relaxed mb-6 font-normal">
                      {item.description}
                    </p>
                    <a 
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0099cc] hover:text-[#007ba3] font-bold text-sm tracking-wider uppercase transition-colors"
                    >
                      MÁS INFORMACIÓN
                    </a>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Arrow */}
          <button
            onClick={goToNext}
            className="absolute right-0 lg:-right-4 z-20 w-12 h-12 bg-transparent lg:bg-white rounded-full lg:shadow-md flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="w-8 h-8 text-gray-500 hover:text-gray-800 transition-colors" strokeWidth={1.5} />
          </button>
        </div>

      </div>
    </section>
  );
};

export default FoundationImpactCarousel;
