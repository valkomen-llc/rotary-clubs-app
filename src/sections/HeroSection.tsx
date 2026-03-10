import { useState, useEffect } from 'react';

const slides = [
  {
    id: 1,
    image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&h=700&fit=crop',
    alt: 'Rotary - Trabajo en equipo'
  },
  {
    id: 2,
    image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&h=700&fit=crop',
    alt: 'Rotary - Promoción de la paz'
  },
  {
    id: 3,
    image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=1600&h=700&fit=crop',
    alt: 'Rotary - Lucha contra enfermedades'
  },
  {
    id: 4,
    image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=1600&h=700&fit=crop',
    alt: 'Rotary - Educación'
  },
  {
    id: 5,
    image: 'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=1600&h=700&fit=crop',
    alt: 'Rotary - Desarrollo económico'
  }
];

const HeroSection = () => {
  const [currentSlide, setCurrentSlide] = useState(0);

  // Auto-play slides every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <style>{`
        @keyframes zoomIn {
          0% {
            transform: scale(1);
          }
          100% {
            transform: scale(1.08);
          }
        }
        
        .hero-slide-image {
          animation: zoomIn 5s ease-out forwards;
        }
      `}</style>
      <section className="relative w-full h-[440px] md:h-[540px] overflow-hidden">
        {/* Slides Container */}
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
          {/* Overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent z-20" />
        </div>
        
        {/* Slide Indicators */}
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
