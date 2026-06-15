import { useState, useEffect } from 'react';

interface EventHeroImage {
  url: string;
  alt?: string;
}

// Hero a pantalla completa para sitios de Evento/Convención.
// 1 imagen → estática; varias → carrusel automático con indicadores.
const EventHeroSection = ({ images }: { images: EventHeroImage[] }) => {
  const slides = images.filter((i) => i && i.url);
  const [current, setCurrent] = useState(0);
  const multiple = slides.length > 1;

  useEffect(() => {
    if (!multiple) return;
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [multiple, slides.length]);

  if (slides.length === 0) return null;

  return (
    <section className="relative w-full h-[88vh] min-h-[560px] max-h-[1000px] overflow-hidden bg-rotary-dark">
      <div className="absolute inset-0">
        {slides.map((slide, index) => (
          <div
            key={index}
            className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
              index === current ? 'opacity-100 z-10' : 'opacity-0 z-0'
            }`}
          >
            <img
              src={slide.url}
              alt={slide.alt || 'Hero'}
              className="w-full h-full object-cover"
            />
          </div>
        ))}
        {/* Degradado sutil inferior para legibilidad si se superpone contenido */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent z-20" />
      </div>

      {multiple && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrent(index)}
              className={`h-3 rounded-full transition-all duration-300 ${
                index === current ? 'bg-white w-8' : 'bg-white/50 hover:bg-white/70 w-3'
              }`}
              aria-label={`Ir a slide ${index + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

export default EventHeroSection;
