import { useState, useEffect } from 'react';
import { useSiteImages } from '../hooks/useSiteImages';

const defaultSlides = [
  { id: 1, image: '/defaults/hero/1-teamwork.png', alt: 'Rotary - Trabajo en equipo' },
  { id: 2, image: '/defaults/hero/2-peace.png', alt: 'Rotary - Promoción de la paz' },
  { id: 3, image: '/defaults/hero/3-health.png', alt: 'Rotary - Lucha contra enfermedades' },
  { id: 4, image: '/defaults/hero/4-education.png', alt: 'Rotary - Educación' },
  { id: 5, image: '/defaults/hero/5-economy.png', alt: 'Rotary - Desarrollo económico' },
];

const HeroSection = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const siteImages = useSiteImages();

  // Build slides from siteImages or defaults
  const slides = (siteImages.hero && siteImages.hero.length > 0)
    ? siteImages.hero.map((img, i) => ({ id: i + 1, image: img.url, alt: img.alt }))
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
      <section className="relative w-full h-[440px] md:h-[540px] overflow-hidden bg-rotary-dark">
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
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent z-20" />
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

export default HeroSection;
