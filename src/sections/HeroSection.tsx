import { useState, useEffect } from 'react';
import { useSiteImages } from '../hooks/useSiteImages';
import { useClub } from '../contexts/ClubContext';
import EventHeroSection from './EventHeroSection';
import { hasCustomTheme } from '../lib/entityTypes';

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
  const { club } = useClub();

  // Hero propio para sitios Evento/Convención (pantalla completa), si tiene imágenes configuradas.
  const eventHero = (club as any)?.eventHeroImages as { url: string; alt?: string }[] | undefined;
  const useEventHero = hasCustomTheme((club as any)?.type) && !!eventHero && eventHero.length > 0;

  // Build slides from siteImages or defaults with framing parameters (v4.1211.0)
  const slides = (siteImages.hero && siteImages.hero.length > 0)
    ? siteImages.hero.map((img: any, i) => {
        const framing = img.framing || {};
        const posX = framing.x ?? img.position?.x ?? 50;
        const posY = framing.y ?? img.position?.y ?? 50;
        const zoom = (framing.zoom ?? img.zoom ?? 100) / 100;
        const mode = framing.mode ?? img.mode ?? 'cover';
        const mobile = framing.mobile || null;
        return {
          id: i + 1,
          image: img.url,
          alt: img.alt,
          posX,
          posY,
          zoom,
          mode,
          mobile,
        };
      })
    : (siteImages._loading ? [] : defaultSlides.map((s) => ({ ...s, posX: 50, posY: 50, zoom: 1, mode: 'cover', mobile: null })));

  useEffect(() => {
    if (useEventHero || siteImages._loading) return; // Wait for initial images

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [slides.length, siteImages._loading, useEventHero]);

  // El corte hacia el hero de Evento va DESPUÉS del `useEffect`, no antes.
  // `club` llega del contexto: en el primer render es null —no hay tema
  // propio, así que el `useEffect` se ejecuta— y en el siguiente ya trae sus
  // imágenes —el `return` de arriba se llevaba el `useEffect` por delante—.
  // React cuenta los hooks, encuentra uno de menos y aborta el árbol: la
  // portada de un sitio de Evento se quedaba EN BLANCO. Mismo defecto que se
  // corrigió en el panel de Postulación de Proyectos (v4.690).
  if (useEventHero) {
    return <EventHeroSection images={eventHero!} />;
  }

  if (siteImages._loading) {
    return (
      <section className="relative w-full h-[440px] md:h-[540px] overflow-hidden bg-gray-100 flex items-center justify-center">
        <div className="absolute inset-0 bg-gray-200 animate-pulse" />
      </section>
    );
  }

  return (
    <>
      {/* El acercamiento vive en el TEMA (`animate-hero-zoom`), no en un
          `<style>` acá: lo usa también el hero de la landing de campaña, y
          escrito dos veces una de las dos se queda atrás al ajustarlo. */}
      <section className="relative w-full h-[440px] md:h-[540px] overflow-hidden bg-rotary-dark">
        <div className="absolute inset-0">
          {slides.map((slide, index) => {
            const isContain = slide.mode === 'contain';
            return (
              <div
                key={slide.id}
                className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                  index === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0'
                }`}
              >
                {/* Si el modo es 'contain' (mostrar imagen completa), fondo ambiental difuminado */}
                {isContain && (
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-cover bg-center blur-2xl scale-110 opacity-60"
                    style={{ backgroundImage: `url(${slide.image})` }}
                  />
                )}
                <img 
                  src={slide.image} 
                  alt={slide.alt} 
                  className={`w-full h-full ${
                    isContain ? 'relative z-10 object-contain' : 'object-cover'
                  } ${index === currentSlide ? 'animate-hero-zoom' : ''}`}
                  style={!isContain ? {
                    objectPosition: `${slide.posX}% ${slide.posY}%`,
                    transform: slide.zoom > 1 ? `scale(${slide.zoom})` : undefined,
                  } : undefined}
                />
              </div>
            );
          })}
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent z-20 pointer-events-none" />
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
