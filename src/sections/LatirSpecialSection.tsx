import React from 'react';
import { Plane, Calendar, Search, Users, Globe, ArrowRight } from 'lucide-react';

const LatirSpecialSection = () => {
  return (
    <section className="py-20 bg-gray-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Modalidades de Intercambio */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold text-gray-900 mb-4 tracking-tight">Modalidades de Intercambio</h2>
          <div className="w-24 h-1 bg-rotary-blue mx-auto mb-12"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-24">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-all group">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-rotary-blue transition-colors">
              <Plane className="w-6 h-6 text-rotary-blue group-hover:text-white" />
            </div>
            <h3 className="font-bold text-lg mb-4">Largo Plazo (LTEP)</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Un año lectivo viviendo con familias y asistiendo a la escuela en otro país.
            </p>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-all group">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-rotary-blue transition-colors">
              <Calendar className="w-6 h-6 text-rotary-blue group-hover:text-white" />
            </div>
            <h3 className="font-bold text-lg mb-4">Corto Plazo (STEP)</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              De varios días a semanas, ideal para vacaciones y campamentos internacionales.
            </p>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-all group">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-rotary-blue transition-colors">
              <Search className="w-6 h-6 text-rotary-blue group-hover:text-white" />
            </div>
            <h3 className="font-bold text-lg mb-4">Intercambios Virtuales</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Modelos híbridos de 3 a 6 meses para jóvenes de 15 a 19 años y sus familias.
            </p>
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-all group">
            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-6 group-hover:bg-rotary-blue transition-colors">
              <Users className="w-6 h-6 text-rotary-blue group-hover:text-white" />
            </div>
            <h3 className="font-bold text-lg mb-4">Nuevas Generaciones (NGSE)</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Pasantías no remuneradas para profesionales de 18 a 30 años en diversas áreas.
            </p>
          </div>
        </div>

        {/* Asociación y Conferencia */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
          {/* Card Nuestra Asociación */}
          <div className="bg-[#0f172a] text-white p-10 rounded-[40px] relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Globe className="w-48 h-48" />
            </div>
            
            <div>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-8">
                <Globe className="w-4 h-4 text-yellow-500" />
                <span className="text-[10px] font-bold tracking-widest uppercase">Nuestra Asociación</span>
              </div>
              
              <p className="text-lg leading-relaxed text-gray-300 mb-12">
                La Asociación Latinoamericana LATIR comprende 18 distritos de todos los países de habla hispana en América del Sur.
              </p>

              <div className="grid grid-cols-2 gap-y-6">
                {[
                  { name: 'ARGENTINA', flag: '🇦🇷' },
                  { name: 'BOLIVIA', flag: '🇧🇴' },
                  { name: 'CHILE', flag: '🇨🇱' },
                  { name: 'COLOMBIA', flag: '🇨🇴' },
                  { name: 'ECUADOR', flag: '🇪🇨' },
                  { name: 'PARAGUAY', flag: '🇵🇾' },
                  { name: 'PERU', flag: '🇵🇪' },
                  { name: 'URUGUAY', flag: '🇺🇾' },
                  { name: 'VENEZUELA', flag: '🇻🇪' },
                ].map((country) => (
                  <div key={country.name} className="flex items-center gap-4">
                    <span className="text-2xl drop-shadow-sm">{country.flag}</span>
                    <span className="text-[11px] font-bold tracking-widest text-gray-400 group-hover:text-white transition-colors uppercase">{country.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Card Conferencia LATIR */}
          <div className="bg-white p-10 rounded-[40px] border border-gray-100 shadow-sm flex flex-col">
            <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mb-8">
              <Calendar className="w-7 h-7 text-orange-500" />
            </div>

            <h3 className="text-2xl font-bold text-gray-900 mb-6 font-display">Conferencia LATIR</h3>
            
            <div className="space-y-4 mb-10">
              <p className="text-sm text-gray-600 leading-relaxed">
                <span className="font-bold text-gray-900">Encuentro Anual (Abril):</span> Una experiencia única que vivencia la magia de RYE, reuniendo a Chairpersons, equipos de trabajo, gobernadores y jóvenes ROTEX.
              </p>

              <p className="text-sm text-gray-600 leading-relaxed">
                Incluye la <span className="font-bold text-gray-900">Asamblea de la Asociación</span> y la célebre <span className="font-bold text-gray-900">Noche de los Sabores del Latir</span>, un festival de interculturalidad único.
              </p>
            </div>

            <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 mb-8">
              <p className="text-sm italic text-gray-600 leading-relaxed border-l-4 border-yellow-500 pl-4">
                "Un espacio de capacitación, compañerismo y planificación donde se generan lazos indestructibles."
              </p>
            </div>

            <div className="mt-auto">
              <button
                onClick={() => window.location.hash = '#/eventos'}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
              >
                <ArrowRight className="w-5 h-5" />
                Ver más sobre la Conferencia LATIR
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LatirSpecialSection;
