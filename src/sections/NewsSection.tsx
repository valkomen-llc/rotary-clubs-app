import { useState, useEffect } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Newspaper } from 'lucide-react';

const newsArticles = [
  {
    id: 1,
    title: 'Olayinka H. Babalola insta a los socios de Rotary a Generar un impacto duradero',
    image: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=600&h=400&fit=crop',
    link: '#'
  },
  {
    id: 2,
    title: 'Entrevista con Bill Gates: El optimista',
    image: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=600&h=400&fit=crop',
    link: '#'
  },
  {
    id: 3,
    title: 'Gente de Acción en todo el mundo',
    image: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=600&h=400&fit=crop',
    link: '#'
  },
  {
    id: 4,
    title: 'Rotary celebra 10 años de impacto en comunidades rurales',
    image: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=600&h=400&fit=crop',
    link: '#'
  },
  {
    id: 5,
    title: 'Nuevos proyectos de agua potable benefician a miles de familias',
    image: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=600&h=400&fit=crop',
    link: '#'
  }
];

const NewsSection = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  const totalSlides = 3;

  // Auto-play carousel every 5 seconds
  useEffect(() => {
    if (!isAutoPlaying) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % totalSlides);
    }, 5000);
    return () => clearInterval(interval);
  }, [isAutoPlaying]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  // Función para obtener las 3 noticias del slide actual
  const getVisibleArticles = () => {
    const start = currentSlide;
    return [
      newsArticles[start % newsArticles.length],
      newsArticles[(start + 1) % newsArticles.length],
      newsArticles[(start + 2) % newsArticles.length]
    ];
  };

  const visibleArticles = getVisibleArticles();

  return (
    <section className="bg-white py-16 md:py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Título */}
        <h2 className="text-3xl md:text-4xl font-light text-gray-800 text-center mb-12">
          Noticias y artículos
        </h2>

        {/* Carrusel de noticias - 3 columnas */}
        <div 
          className="relative"
          onMouseEnter={() => setIsAutoPlaying(false)}
          onMouseLeave={() => setIsAutoPlaying(true)}
        >
          {/* Grid de 3 noticias */}
          <div 
            className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 transition-all duration-500"
          >
            {visibleArticles.map((article, index) => (
              <a
                key={`${currentSlide}-${article.id}-${index}`}
                href={article.link}
                className="group relative block overflow-hidden rounded-lg"
                style={{ aspectRatio: '4/3' }}
              >
                {/* Imagen de fondo */}
                <img
                  src={article.image}
                  alt={article.title}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                
                {/* Overlay degradado */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                
                {/* Contenido */}
                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
                  <h3 className="text-white text-sm md:text-base font-light leading-snug mb-2 line-clamp-3">
                    {article.title}
                  </h3>
                  <span className="inline-flex items-center text-white font-semibold text-xs md:text-sm group-hover:underline">
                    Más información
                    <ArrowRight className="w-3 h-3 md:w-4 md:h-4 ml-1 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </a>
            ))}
          </div>

          {/* Botones de navegación */}
          <button
            onClick={prevSlide}
            className="absolute left-0 md:-left-4 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-all duration-300 z-10"
            aria-label="Slide anterior"
          >
            <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-gray-800" />
          </button>

          <button
            onClick={nextSlide}
            className="absolute right-0 md:-right-4 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-all duration-300 z-10"
            aria-label="Slide siguiente"
          >
            <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-gray-800" />
          </button>

          {/* Indicadores de puntos */}
          <div className="flex justify-center gap-2 mt-6">
            {[0, 1, 2].map((index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  index === currentSlide 
                    ? 'bg-rotary-blue w-8' 
                    : 'bg-gray-300 w-2 hover:bg-gray-400'
                }`}
                aria-label={`Ir a slide ${index + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Botón CTA - Mismo estilo que los demás botones del sitio */}
        <div className="text-center mt-10">
          <a
            href="#noticias"
            className="inline-flex items-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
          >
            <Newspaper className="w-5 h-5 text-rotary-gold" />
            Explora más noticias y artículos
          </a>
        </div>
      </div>
    </section>
  );
};

export default NewsSection;
