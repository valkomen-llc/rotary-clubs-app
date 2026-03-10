/*
  ╔══════════════════════════════════════════════════════════════════════════════╗
  ║  ÁREAS DE INTERÉS ROTARY - COMPONENTE CÍRCULOS CON CARRUSEL MÓVIL          ║
  ║  ─────────────────────────────────────────────────────────────────────────── ║
  ║  INSTRUCCIONES DE PERSONALIZACIÓN:                                           ║
  ║  1. Imágenes: Reemplazar las URLs en la constante 'areas' abajo              ║
  ║  2. Títulos: Modificar la propiedad 'title' en cada objeto del array         ║
  ║  3. Colores: Ajustar las variables CSS en :root                              ║
  ╚══════════════════════════════════════════════════════════════════════════════╝
*/

import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Globe } from 'lucide-react';

/* 
  ═══════════════════════════════════════════════════════════════════════════════
  VARIABLES CSS - Personaliza colores y medidas aquí
  ═══════════════════════════════════════════════════════════════════════════════
*/
const styles = `
  :root {
    /* Colores Rotary */
    --rotary-navy: #1a2b4a;
    --rotary-blue: #17458f;
    --rotary-gold: #f5a623;
    --rotary-gold-light: #ffc947;
    
    /* Dimensiones círculos */
    --circle-size: 260px;
    --circle-size-md: 200px;
    --circle-size-sm: 280px;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     CONTENEDOR PRINCIPAL
     ═══════════════════════════════════════════════════════════════════════════ */
  .areas-rotary {
    background-color: #0c3c7c;
    background-image: url('/geo-darkblue.png');
    background-position: 50% 0;
    background-repeat: repeat;
    background-size: 71px 85px;
    padding: 4rem 1rem;
  }

  .areas-rotary__header {
    text-align: center;
    max-width: 800px;
    margin: 0 auto 3rem;
  }

  .areas-rotary__title {
    color: #fff;
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    font-weight: 300;
    margin-bottom: 1.5rem;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  }

  .areas-rotary__description {
    color: rgba(255, 255, 255, 0.85);
    font-size: clamp(0.875rem, 2vw, 1rem);
    line-height: 1.7;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     GRID DE CÍRCULOS - Layout 3 columnas (Desktop/Tablet)
     ═══════════════════════════════════════════════════════════════════════════ */
  .areas-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 40px 2rem; /* 40px vertical, 2rem horizontal */
    max-width: 1200px;
    margin: 0 auto;
    align-items: start;
  }

  /* Columnas individuales */
  .areas-column {
    display: flex;
    flex-direction: column;
    gap: 40px; /* ESPACIO DE 40px ENTRE ÁREAS */
  }

  /* Columnas laterales (1 y 3) con margen superior de 120px */
  .areas-column--side {
    margin-top: 120px;
  }

  /* Columna central */
  .areas-column--center {
    /* Sin margen superior */
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     ITEM INDIVIDUAL (Círculo + Texto)
     ═══════════════════════════════════════════════════════════════════════════ */
  .area-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-decoration: none;
    transition: transform 0.3s ease;
  }

  .area-item:hover {
    transform: translateY(-5px);
  }

  /* Círculo con imagen */
  .area-item__circle {
    position: relative;
    width: var(--circle-size);
    height: var(--circle-size);
    border-radius: 50%;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    transition: box-shadow 0.3s ease;
  }

  .area-item:hover .area-item__circle {
    box-shadow: 0 0 0 4px var(--rotary-gold), 0 8px 30px rgba(0, 0, 0, 0.4);
  }

  /* Imagen de fondo */
  .area-item__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.5s ease;
  }

  .area-item:hover .area-item__image {
    transform: scale(1.1);
  }

  /* Overlay oscuro */
  .area-item__overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.3) 100%);
    transition: background 0.3s ease;
  }

  .area-item:hover .area-item__overlay {
    background: linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.4) 100%);
  }

  /* Título debajo del círculo - UNA SOLA LÍNEA */
  .area-item__title {
    margin-top: 0.75rem;
    color: #fff;
    font-size: 0.9rem;
    font-weight: 600;
    text-align: center;
    line-height: 1.3;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    white-space: nowrap;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     CARRUSEL MÓVIL
     ═══════════════════════════════════════════════════════════════════════════ */
  .areas-carousel {
    display: none;
    position: relative;
    max-width: 320px;
    margin: 0 auto;
  }

  .areas-carousel__container {
    overflow: hidden;
    border-radius: 50%;
    aspect-ratio: 1;
    width: var(--circle-size-sm);
    height: var(--circle-size-sm);
    margin: 0 auto;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  .areas-carousel__track {
    display: flex;
    transition: transform 0.4s ease-in-out;
    height: 100%;
  }

  .areas-carousel__slide {
    min-width: 100%;
    height: 100%;
    position: relative;
  }

  .areas-carousel__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .areas-carousel__overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.4) 100%);
  }

  .areas-carousel__title {
    position: absolute;
    bottom: 15%;
    left: 0;
    right: 0;
    text-align: center;
    color: #fff;
    font-size: 0.95rem;
    font-weight: 600;
    padding: 0 1rem;
    text-shadow: 0 2px 8px rgba(0, 0, 0, 0.6);
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  }

  /* Botones de navegación del carrusel */
  .areas-carousel__nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 40px;
    height: 40px;
    background: rgba(255, 255, 255, 0.9);
    border: none;
    border-radius: 50%;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
    transition: background 0.2s ease, transform 0.2s ease;
    z-index: 10;
  }

  .areas-carousel__nav:hover {
    background: #fff;
    transform: translateY(-50%) scale(1.1);
  }

  .areas-carousel__nav--prev {
    left: -10px;
  }

  .areas-carousel__nav--next {
    right: -10px;
  }

  .areas-carousel__nav svg {
    width: 20px;
    height: 20px;
    color: var(--rotary-navy);
  }

  /* Indicadores de puntos */
  .areas-carousel__dots {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-top: 1.5rem;
  }

  .areas-carousel__dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.4);
    border: none;
    cursor: pointer;
    transition: background 0.3s ease, transform 0.2s ease;
  }

  .areas-carousel__dot--active {
    background: var(--rotary-gold);
    transform: scale(1.2);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     BOTÓN CTA
     ═══════════════════════════════════════════════════════════════════════════ */
  .areas-rotary__cta {
    text-align: center;
    margin-top: 3rem;
  }

  .areas-rotary__button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    background: #e8f4fc;
    color: var(--rotary-blue);
    padding: 0.875rem 2rem;
    border-radius: 9999px;
    font-weight: 600;
    font-size: 0.95rem;
    text-decoration: none;
    border: none;
    cursor: pointer;
    transition: background 0.3s ease, transform 0.2s ease;
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  }

  .areas-rotary__button:hover {
    background: #d0e8f7;
    transform: translateY(-2px);
  }

  .areas-rotary__button svg {
    color: var(--rotary-gold);
    width: 1.25rem;
    height: 1.25rem;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RESPONSIVE - Tablet (2 columnas)
     ═══════════════════════════════════════════════════════════════════════════ */
  @media (max-width: 768px) {
    .areas-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 30px 1.5rem;
    }

    .areas-column--side {
      margin-top: 60px;
    }

    .areas-column {
      gap: 30px;
    }

    .area-item__circle {
      width: var(--circle-size-md);
      height: var(--circle-size-md);
    }

    .area-item__title {
      font-size: 0.85rem;
      white-space: normal;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RESPONSIVE - Mobile (Carrusel de 1 área)
     ═══════════════════════════════════════════════════════════════════════════ */
  @media (max-width: 480px) {
    .areas-rotary {
      padding: 2.5rem 1rem;
    }

    /* Ocultar grid en móvil */
    .areas-grid {
      display: none;
    }

    /* Mostrar carrusel en móvil */
    .areas-carousel {
      display: block;
    }

    .areas-rotary__button {
      padding: 0.75rem 1.5rem;
      font-size: 0.875rem;
    }
  }
`;

/* 
  ═══════════════════════════════════════════════════════════════════════════════
  DATOS - Modifica imágenes y títulos aquí
  ═══════════════════════════════════════════════════════════════════════════════
*/
const areas = [
  {
    id: 'paz',
    title: 'Promoción de la paz',
    image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=500&h=500&fit=crop',
    alt: 'Personas de diferentes culturas dialogando en un ambiente de paz'
  },
  {
    id: 'enfermedades',
    title: 'Lucha contra las enfermedades',
    image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&h=500&fit=crop',
    alt: 'Profesional de salud administrando vacuna a un niño'
  },
  {
    id: 'agua',
    title: 'Suministro de agua salubre',
    image: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=500&h=500&fit=crop',
    alt: 'Persona accediendo a agua limpia y potable'
  },
  {
    id: 'materno',
    title: 'Mejorando la salud materno-infantil',
    image: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=500&h=500&fit=crop',
    alt: 'Madre con su bebé recibiendo atención médica'
  },
  {
    id: 'educacion',
    title: 'Apoyo a la educación',
    image: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=500&h=500&fit=crop',
    alt: 'Niños en un aula de clase aprendiendo'
  },
  {
    id: 'economia',
    title: 'Desarrollo de las economías locales',
    image: 'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=500&h=500&fit=crop',
    alt: 'Comerciantes locales en su negocio'
  },
  {
    id: 'medioambiente',
    title: 'Protección del medioambiente',
    image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=500&h=500&fit=crop',
    alt: 'Bosque verde representando la naturaleza'
  }
];

// Áreas organizadas por columnas para desktop
const areasByColumn = {
  left: [areas[0], areas[3]], // Promoción de la paz, Mejorando la salud materno-infantil
  center: [areas[1], areas[4], areas[6]], // Lucha contra las enfermedades, Apoyo a la educación, Protección del medioambiente
  right: [areas[2], areas[5]] // Suministro de agua salubre, Desarrollo de las economías locales
};

const CausesHexSection = ({ showHeader = true }: { showHeader?: boolean }) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % areas.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + areas.length) % areas.length);
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  // Auto-play carousel
  useEffect(() => {
    const interval = setInterval(() => {
      nextSlide();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      <style>{styles}</style>
      <section id="nuestras-causas" className="areas-rotary" aria-labelledby="areas-title">
        {/* Header */}
        {showHeader && (
          <header className="areas-rotary__header">
            <h2 id="areas-title" className="areas-rotary__title">
              Rotary Club
            </h2>
            <p className="areas-rotary__description">
              La labor de Rotary surge directamente de las necesidades de las comunidades, cada una con sus propios desafíos.
              Para maximizar nuestro impacto, hemos enfocado nuestras acciones en siete áreas prioritarias que abordan las
              necesidades más urgentes y comunes de la humanidad. A través de la Fundación Rotaria, que gestiona y distribuye
              los recursos, implementamos proyectos y actividades con resultados comprobados y sostenibles en beneficio de la comunidad.
            </p>
          </header>
        )}

        {/* Grid de Círculos - Desktop/Tablet */}
        <div className="areas-grid" role="list" aria-label="Áreas de interés de Rotary">
          {/* Columna 1 - Izquierda (2 elementos) - margen superior 120px */}
          <div className="areas-column areas-column--side" role="group" aria-label="Columna izquierda">
            {areasByColumn.left.map((area) => (
              <a
                key={area.id}
                href={`#${area.id}`}
                className="area-item"
                role="listitem"
                aria-label={`Área de interés: ${area.title}`}
              >
                <div className="area-item__circle">
                  <img
                    src={area.image}
                    alt={area.alt}
                    className="area-item__image"
                    loading="lazy"
                  />
                  <div className="area-item__overlay" aria-hidden="true" />
                </div>
                <span className="area-item__title">{area.title}</span>
              </a>
            ))}
          </div>

          {/* Columna 2 - Centro (3 elementos) */}
          <div className="areas-column areas-column--center" role="group" aria-label="Columna central">
            {areasByColumn.center.map((area) => (
              <a
                key={area.id}
                href={`#${area.id}`}
                className="area-item"
                role="listitem"
                aria-label={`Área de interés: ${area.title}`}
              >
                <div className="area-item__circle">
                  <img
                    src={area.image}
                    alt={area.alt}
                    className="area-item__image"
                    loading="lazy"
                  />
                  <div className="area-item__overlay" aria-hidden="true" />
                </div>
                <span className="area-item__title">{area.title}</span>
              </a>
            ))}
          </div>

          {/* Columna 3 - Derecha (2 elementos) - margen superior 120px */}
          <div className="areas-column areas-column--side" role="group" aria-label="Columna derecha">
            {areasByColumn.right.map((area) => (
              <a
                key={area.id}
                href={`#${area.id}`}
                className="area-item"
                role="listitem"
                aria-label={`Área de interés: ${area.title}`}
              >
                <div className="area-item__circle">
                  <img
                    src={area.image}
                    alt={area.alt}
                    className="area-item__image"
                    loading="lazy"
                  />
                  <div className="area-item__overlay" aria-hidden="true" />
                </div>
                <span className="area-item__title">{area.title}</span>
              </a>
            ))}
          </div>
        </div>

        {/* Carrusel - Mobile (solo 1 área visible) */}
        <div className="areas-carousel" role="region" aria-label="Carrusel de áreas de interés">
          <button
            className="areas-carousel__nav areas-carousel__nav--prev"
            onClick={prevSlide}
            aria-label="Área anterior"
          >
            <ChevronLeft />
          </button>

          <div className="areas-carousel__container">
            <div
              className="areas-carousel__track"
              ref={carouselRef}
              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            >
              {areas.map((area) => (
                <div key={area.id} className="areas-carousel__slide">
                  <img
                    src={area.image}
                    alt={area.alt}
                    className="areas-carousel__image"
                  />
                  <div className="areas-carousel__overlay" />
                  <span className="areas-carousel__title">{area.title}</span>
                </div>
              ))}
            </div>
          </div>

          <button
            className="areas-carousel__nav areas-carousel__nav--next"
            onClick={nextSlide}
            aria-label="Área siguiente"
          >
            <ChevronRight />
          </button>

          {/* Indicadores de puntos */}
          <div className="areas-carousel__dots" role="tablist">
            {areas.map((_, index) => (
              <button
                key={index}
                className={`areas-carousel__dot ${index === currentSlide ? 'areas-carousel__dot--active' : ''}`}
                onClick={() => goToSlide(index)}
                role="tab"
                aria-selected={index === currentSlide}
                aria-label={`Ir al área ${index + 1} de ${areas.length}`}
              />
            ))}
          </div>
        </div>

        {/* CTA Button */}
        <div className="areas-rotary__cta">
          <a href="#areas-interes" className="areas-rotary__button">
            <Globe className="w-5 h-5" />
            Nuestras Áreas de Interés
          </a>
        </div>
      </section>
    </>
  );
};

export default CausesHexSection;
