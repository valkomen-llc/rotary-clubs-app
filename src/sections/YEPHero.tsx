import { useState, useEffect } from 'react';
import { useSiteImages } from '../hooks/useSiteImages';

const defaultSlides = [
  { id: 1, image: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 1' },
  { id: 2, image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 2' },
  { id: 3, image: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=1600&h=800&fit=crop', alt: 'Intercambio de Jóvenes 3' },
];

const YEPHero = ({ title, description }: { title: string, description: string }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const siteImages = useSiteImages();

  // Build slides from siteImages or defaults
  const slides = (siteImages.yep && siteImages.yep.length > 0)
    ? siteImages.yep.map((img, i) => ({ id: i + 1, image: img.url, alt: img.alt }))
    : defaultSlides;

  useEffect(() => {
    if (siteImages._loading) return; // Wait for initial images

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [slides.length, siteImages._loading]);

  if (siteImages._loading) {
    return (
      <section className="relative w-full h-[440px] md:h-[540px] overflow-hidden bg-gray-100 flex items-center justify-center">
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      </section>
    );
  }

  return (
    <>
      <style>{`
        @keyframes zoomIn {
          0% { transform: scale(1); }
          100% { transform: scale(1.08); }
        }
        .hero-slide-image {
          animation: zoomIn 5s ease-out forwards;
        }
      `}</style>
      <section className="relative w-full h-[500px] md:h-[600px] overflow-hidden">
        <div className="absolute inset-0">
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                index === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0'
              }`}
            >
              <img 
                src={slide.image} 
                alt={slide.alt} 
                className={`w-full h-full object-cover ${index === currentSlide ? 'hero-slide-image' : ''}`}
              />
            </div>
          ))}
          <div className="absolute inset-0 bg-gradient-to-r from-rotary-navy/90 via-rotary-navy/70 to-transparent z-20" />
        </div>
        
        <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center z-30">
          <div className="max-w-2xl text-left pointer-events-none">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              {title}
            </h1>
            <p className="text-white/90 text-lg md:text-xl leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentSlide(index)}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                index === currentSlide 
                  ? 'bg-white w-8' 
                  : 'bg-white/50 hover:bg-white/70'
              }`}
              aria-label={`Ir a slide ${index + 1}`}
            />
          ))}
        </div>
      </section>
    </>
  );
};

export default YEPHero;
