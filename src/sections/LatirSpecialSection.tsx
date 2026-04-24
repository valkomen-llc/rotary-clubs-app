import { Plane, Calendar, Search, Users, Globe, ArrowRight, Sparkles, MapPin, Award } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const LatirSpecialSection = () => {
  const navigate = useNavigate();
  return (
    <section className="py-24 bg-rotary-concrete relative overflow-hidden">
      {/* Background Decorative Elements */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-100 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-orange-50 rounded-full blur-[120px]"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header Section */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rotary-blue/5 border border-rotary-blue/10 mb-6 group hover:bg-rotary-blue/10 transition-colors duration-300">
            <Sparkles className="w-4 h-4 text-rotary-blue animate-pulse" />
            <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-rotary-blue">Programas de Intercambio</span>
          </div>
          <h2 className="text-4xl md:text-5xl text-[#0a1628] mb-6 tracking-tight">
            Modalidades del Programa RYE
          </h2>
          <p className="max-w-2xl mx-auto text-gray-500 text-lg leading-relaxed">
            Descubre las diferentes formas en las que puedes vivir una experiencia internacional transformadora con Rotary.
          </p>
        </div>

        {/* Modalidades de Intercambio Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-24">
          {[
            {
              icon: <Plane />,
              title: "Largo Plazo (LTEP)",
              desc: "Un año lectivo viviendo con familias y asistiendo a la escuela en otro país.",
              color: "blue"
            },
            {
              icon: <Calendar />,
              title: "Corto Plazo (STEP)",
              desc: "De varios días a semanas, ideal para vacaciones y campamentos internacionales.",
              color: "orange"
            },
            {
              icon: <Search />,
              title: "Intercambios Virtuales",
              desc: "Modelos híbridos de 3 a 6 meses para jóvenes de 15 a 19 años y sus familias.",
              color: "indigo"
            },
            {
              icon: <Users />,
              title: "Nuevas Generaciones",
              desc: "Pasantías no remuneradas para profesionales de 18 a 30 años en diversas áreas.",
              color: "sky"
            }
          ].map((item, index) => (
            <div 
              key={index}
              className="group relative bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-2xl hover:shadow-blue-500/10 transition-all duration-500 hover:-translate-y-2"
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 transition-all duration-500 group-hover:scale-110 group-hover:rotate-3 ${
                item.color === 'blue' ? 'bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white' :
                item.color === 'orange' ? 'bg-orange-50 text-orange-600 group-hover:bg-orange-600 group-hover:text-white' :
                item.color === 'indigo' ? 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white' :
                'bg-sky-50 text-sky-600 group-hover:bg-sky-600 group-hover:text-white'
              }`}>
                {item.icon}
              </div>
              <h3 className="font-bold text-xl mb-4 group-hover:text-rotary-blue transition-colors">{item.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                {item.desc}
              </p>
              <div className="pt-4 border-t border-gray-50 flex items-center text-[10px] font-bold tracking-widest text-gray-400 group-hover:text-rotary-blue transition-colors">
                DESCUBRE MÁS <ArrowRight className="w-3 h-3 ml-2 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>

        {/* Asociación y Conferencia Split */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-stretch">
          {/* Card Nuestra Asociación */}
          <div className="relative group overflow-hidden bg-[#0a1128] text-white p-12 rounded-[48px] shadow-2xl flex flex-col justify-between">
            {/* Animated Mesh Gradient Overlay */}
            <div className="absolute inset-0 opacity-30 group-hover:opacity-40 transition-opacity duration-700">
              <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-br from-rotary-blue/40 to-transparent"></div>
              <div className="absolute -top-[20%] -right-[20%] w-[60%] h-[60%] bg-sky-500 rounded-full blur-[100px] animate-pulse"></div>
            </div>

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-8 backdrop-blur-md">
                <Globe className="w-4 h-4 text-sky-400 animate-spin-slow" />
                <span className="text-[10px] font-bold tracking-widest uppercase opacity-80">Nuestra Asociación</span>
              </div>
              
              <h3 className="text-3xl font-bold mb-6">Asociación LATIR</h3>
              <p className="text-lg leading-relaxed text-gray-400 mb-12 max-w-md">
                Comprende 18 distritos de todos los países de habla hispana en América del Sur, unidos por un propósito común.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-8 gap-x-4">
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
                  <div key={country.name} className="group/country flex flex-col gap-2">
                    <span className="text-3xl filter saturate-150 group-hover/country:scale-110 transition-transform duration-300 origin-left cursor-default">{country.flag}</span>
                    <span className="text-[10px] font-bold tracking-widest text-gray-500 group-hover/country:text-sky-400 transition-colors uppercase">{country.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="absolute bottom-0 right-0 p-12 opacity-5 scale-150 group-hover:rotate-12 transition-transform duration-1000">
              <Globe className="w-64 h-64" />
            </div>
          </div>

          {/* Card Conferencia LATIR - The "Event" Card */}
          <div className="relative group bg-white rounded-[48px] overflow-hidden border border-gray-100 shadow-xl flex flex-col">
            {/* Image Header */}
            <div className="h-64 relative overflow-hidden">
              <img 
                src="https://rotary-platform-assets.s3.us-east-1.amazonaws.com/events/1776276597620-upload.jpg" 
                alt="V Conferencia LATIR / IV Conferencia ROTEX" 
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
              <div className="absolute bottom-6 left-8 right-8">
                <div className="flex items-center gap-3 text-white mb-2">
                  <div className="px-3 py-1 bg-orange-500 rounded-full text-[10px] font-bold tracking-wider uppercase">Evento Anual</div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wider uppercase opacity-80">
                    <MapPin className="w-3 h-3" /> Conferencia LATIR
                  </div>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-white uppercase tracking-tight">V Conferencia LATIR / IV Conferencia ROTEX</h3>
              </div>
            </div>

            <div className="p-10 flex flex-col flex-1">
              <div className="space-y-6 mb-12">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-rotary-blue">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 group-hover:text-rotary-blue transition-colors">Encuentro en Abril</h4>
                    <p className="text-sm text-gray-500 leading-relaxed mt-1">
                      Una experiencia única reuniendo a Chairpersons, gobernadores y jóvenes ROTEX.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">Interculturalidad</h4>
                    <p className="text-sm text-gray-500 leading-relaxed mt-1">
                      Disfruta de la célebre <span className="text-gray-900 font-semibold">Noche de los Sabores</span>, un festival de cultura único.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-auto">
                <button
                  onClick={() => navigate('/conferencia')}
                  className="group/btn relative w-full inline-flex items-center justify-center gap-3 bg-rotary-blue hover:bg-rotary-blue-700 text-white font-bold px-8 py-5 rounded-2xl transition-all duration-300 shadow-xl shadow-blue-500/20 overflow-hidden"
                >
                  <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-sky-400 to-rotary-blue opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500"></div>
                  <span className="relative z-10">VER DETALLES DE CONFERENCIA</span>
                  <ArrowRight className="relative z-10 w-5 h-5 group-hover/btn:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 12s linear infinite;
        }
      `}</style>
    </section>
  );
};

export default LatirSpecialSection;

