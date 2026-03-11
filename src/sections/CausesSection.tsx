import { Globe } from 'lucide-react';
import { useClub } from '../contexts/ClubContext';

const causes = [
  {
    title: 'Lucha contra las enfermedades',
    image: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=500&h=500&fit=crop',
    position: 'top'
  },
  {
    title: 'Promoción de la paz',
    image: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=500&h=500&fit=crop',
    position: 'left-top'
  },
  {
    title: 'Suministro de agua salubre',
    image: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=500&h=500&fit=crop',
    position: 'right-top'
  },
  {
    title: 'Apoyo a la educación',
    image: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=500&h=500&fit=crop',
    position: 'center'
  },
  {
    title: 'Mejorando la salud materno-infantil',
    image: 'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=500&h=500&fit=crop',
    position: 'left-bottom'
  },
  {
    title: 'Desarrollo de las economías locales',
    image: 'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=500&h=500&fit=crop',
    position: 'right-bottom'
  },
  {
    title: 'Protección del medioambiente',
    image: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=500&h=500&fit=crop',
    position: 'bottom'
  }
];

const CausesSection = () => {
  const { club } = useClub();
  return (
    <section className="bg-rotary-navy py-16 md:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
            {club?.name || 'Rotary Club'}
          </h2>
          <p className="text-white/80 max-w-3xl mx-auto leading-relaxed text-sm md:text-base">
            La labor de Rotary surge directamente de las necesidades de las comunidades, cada una con sus propios desafíos. Para maximizar nuestro impacto, hemos enfocado nuestras acciones en siete áreas prioritarias que abordan las necesidades más urgentes y comunes de la humanidad. A través de la Fundación Rotaria, que gestiona y distribuye los recursos, implementamos proyectos y actividades con resultados comprobados y sostenibles en beneficio de la comunidad.
          </p>
        </div>

        {/* Honeycomb Layout - Diamond Pattern */}
        <div className="relative flex flex-col items-center">
          {/* Row 1 - Top center */}
          <div className="flex justify-center" style={{ marginBottom: '100px' }}>
            <div className="flex flex-col items-center group cursor-pointer">
              <div className="w-44 h-44 md:w-56 md:h-56 lg:w-64 lg:h-64 rounded-full overflow-hidden shadow-2xl">
                <img
                  src={causes[0].image}
                  alt={causes[0].title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <span className="text-white text-sm md:text-base font-medium text-center mt-4 max-w-[200px]">
                {causes[0].title}
              </span>
            </div>
          </div>

          {/* Row 2 - Two items */}
          <div className="flex justify-center gap-6 md:gap-16 lg:gap-24" style={{ marginBottom: '100px' }}>
            <div className="flex flex-col items-center group cursor-pointer">
              <div className="w-44 h-44 md:w-56 md:h-56 lg:w-64 lg:h-64 rounded-full overflow-hidden shadow-2xl">
                <img
                  src={causes[1].image}
                  alt={causes[1].title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <span className="text-white text-sm md:text-base font-medium text-center mt-4 max-w-[200px]">
                {causes[1].title}
              </span>
            </div>
            <div className="flex flex-col items-center group cursor-pointer">
              <div className="w-44 h-44 md:w-56 md:h-56 lg:w-64 lg:h-64 rounded-full overflow-hidden shadow-2xl">
                <img
                  src={causes[2].image}
                  alt={causes[2].title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <span className="text-white text-sm md:text-base font-medium text-center mt-4 max-w-[200px]">
                {causes[2].title}
              </span>
            </div>
          </div>

          {/* Row 3 - Center */}
          <div className="flex justify-center" style={{ marginBottom: '100px' }}>
            <div className="flex flex-col items-center group cursor-pointer">
              <div className="w-44 h-44 md:w-56 md:h-56 lg:w-64 lg:h-64 rounded-full overflow-hidden shadow-2xl">
                <img
                  src={causes[3].image}
                  alt={causes[3].title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <span className="text-white text-sm md:text-base font-medium text-center mt-4 max-w-[200px]">
                {causes[3].title}
              </span>
            </div>
          </div>

          {/* Row 4 - Two items */}
          <div className="flex justify-center gap-6 md:gap-16 lg:gap-24" style={{ marginBottom: '100px' }}>
            <div className="flex flex-col items-center group cursor-pointer">
              <div className="w-44 h-44 md:w-56 md:h-56 lg:w-64 lg:h-64 rounded-full overflow-hidden shadow-2xl">
                <img
                  src={causes[4].image}
                  alt={causes[4].title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <span className="text-white text-sm md:text-base font-medium text-center mt-4 max-w-[220px]">
                {causes[4].title}
              </span>
            </div>
            <div className="flex flex-col items-center group cursor-pointer">
              <div className="w-44 h-44 md:w-56 md:h-56 lg:w-64 lg:h-64 rounded-full overflow-hidden shadow-2xl">
                <img
                  src={causes[5].image}
                  alt={causes[5].title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <span className="text-white text-sm md:text-base font-medium text-center mt-4 max-w-[220px]">
                {causes[5].title}
              </span>
            </div>
          </div>

          {/* Row 5 - Bottom center */}
          <div className="flex justify-center">
            <div className="flex flex-col items-center group cursor-pointer">
              <div className="w-44 h-44 md:w-56 md:h-56 lg:w-64 lg:h-64 rounded-full overflow-hidden shadow-2xl">
                <img
                  src={causes[6].image}
                  alt={causes[6].title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <span className="text-white text-sm md:text-base font-medium text-center mt-4 max-w-[200px]">
                {causes[6].title}
              </span>
            </div>
          </div>
        </div>

        {/* CTA Button */}
        <div className="text-center mt-16">
          <button
            className="inline-flex items-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
          >
            <Globe className="w-5 h-5 text-rotary-gold" />
            Nuestras Áreas de Interés
          </button>
        </div>
      </div>
    </section>
  );
};

export default CausesSection;
