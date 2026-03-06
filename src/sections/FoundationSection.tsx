import { Gift } from 'lucide-react';

const FoundationSection = () => {
  return (
    <section className="relative w-full min-h-[500px] md:min-h-[600px] overflow-hidden">
      {/* Imagen de fondo */}
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=1600&h=800&fit=crop"
          alt="Fundación Rotary - Trabajo comunitario"
          className="w-full h-full object-cover"
        />
        {/* Overlay sutil */}
        <div className="absolute inset-0 bg-black/20" />
      </div>

      {/* Contenido - Caja de texto */}
      <div className="relative z-10 min-h-[500px] md:min-h-[600px] flex items-center justify-end max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="bg-white rounded-2xl md:rounded-3xl shadow-2xl px-8 md:px-12 py-10 md:py-12 max-w-lg w-full ml-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">
            Nuestra Fundación
          </h2>
          <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-8">
            Contribuye a La Fundación Rotaria para financiar proyectos de servicio que mejoran las condiciones de vida de las personas tanto en las comunidades locales como en todo el mundo.
          </p>
          <button
            className="inline-flex items-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-rotary-condensed font-bold px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
          >
            <Gift className="w-5 h-5 text-rotary-gold" />
            Apoya la Fundación Rotaria
          </button>
        </div>
      </div>
    </section>
  );
};

export default FoundationSection;
