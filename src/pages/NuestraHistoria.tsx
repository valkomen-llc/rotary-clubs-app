import { useState } from 'react';
import { Star, ChevronLeft, ChevronRight, User, ShieldCheck } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';
import { useSiteImages } from '../hooks/useSiteImages';

const ORIGEN_FOUNDERS = [
  "Ricardo Jaramillo (Past RDR 2008–2009)",
  "Andrés Patiño (Past RDR 2009–2010)",
  "Lucas Lasso (Past RDR 2010–2011)",
  "Israel David Castellanos (Past RDR 2011–2012)",
  "Luz Adriana Bermúdez (Past RDR 2012–2013)",
  "Leidy Viviana Hurtado",
  "", // Spacer to push Natalia to middle column
  "Natalia Giraldo"
];

const NuestraHistoria = () => {
  const { club } = useClub();
  const { sections } = useCMSContent('nuestra-historia', club.id);
  const images = useSiteImages();
  const [currentImage, setCurrentImage] = useState(0);

  const getC = (section: string, field: string, fallback: string) =>
    sections[section]?.[field] || fallback;

  // Detección robusta de Rotary E-Club Origen
  const isOrigen = 
    club.name?.toLowerCase().includes('origen') || 
    club.id?.toString() === '1' ||
    club.subdomain === 'rotary-e-club-origen' ||
    window.location.href.includes('rotary-e-club-origen');

  const heroImage = images?.history?.[0]?.url || 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&h=500&fit=crop';
  const timelineImage = images?.history?.[1]?.url || 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop';

  const galleryImages = [
    images?.history?.[2]?.url || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=500&fit=crop',
    images?.history?.[3]?.url || 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&h=500&fit=crop',
    images?.history?.[4]?.url || 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=800&h=500&fit=crop',
  ];

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <section className="relative w-full h-[300px] md:h-[400px] overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="Rotary Team"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/30" />
        </div>
        <div className="relative h-full flex items-center justify-center">
          {/* Title removed per user request */}
        </div>
      </section>

      {/* Intro Section - Blue Background */}
      <section
        className="py-12 md:py-16"
        style={{
          backgroundColor: '#0c3c7c',
          backgroundImage: "url('/geo-darkblue.png')",
          backgroundPosition: '50% 0',
          backgroundRepeat: 'repeat',
          backgroundSize: '71px 85px'
        }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-white leading-tight font-light" style={{ fontSize: '35px' }}>
            Nuestra Historia
          </h1>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-20 md:py-28 bg-rotary-concrete">
        <div className="max-w-7xl mx-auto px-6 space-y-24">

          {/* Los orígenes de Rotary */}
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-normal text-[#333333] mb-6 text-center">{getC('origins', 'title', "Los orígenes de Rotary")}</h2>
            <p className="text-lg leading-relaxed text-gray-800 whitespace-pre-line text-left">
              {getC('origins', 'text', "Rotary nació en Chicago en 1905, cuando Paul Harris, un joven abogado, reunió a profesionales de distintas áreas con el propósito de intercambiar ideas, cultivar la amistad y servir a la comunidad. Lo que empezó como un pequeño círculo pronto se expandió a todos los continentes, convirtiéndose en una red mundial de líderes comprometidos con la paz, la salud, la educación y el desarrollo sostenible. Hoy, más de 1,4 millones de rotarios en más de 200 países continúan soñando en grande y haciendo realidad proyectos que transforman vidas.")}
            </p>
            
            {/* Paul Harris Quote */}
            <div className="mt-16 mb-16 text-center flex flex-col items-center">
              <h2 className="text-3xl md:text-[34px] font-light text-gray-600 mb-8 italic leading-snug max-w-3xl">
                {getC('quote', 'text', "«Más allá de lo que Rotary signifique para nosotros, el mundo lo conocerá por las obras que realice.»")}
              </h2>
              <div className="flex flex-col items-center gap-3">
                <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-gray-100 shadow-sm bg-gray-50">
                  <img 
                    src={images.paulHarrisAvatar?.url || "https://www.rotary.org/sites/default/files/styles/w_600/public/Paul%20Harris%20portrait.jpg"} 
                    alt="Paul Harris" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <p className="font-bold text-gray-800 text-lg">{getC('quote', 'author', "Paul Harris")}</p>
                  <p className="text-gray-500 font-light text-sm">{getC('quote', 'role', "Fundador de Rotary")}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-24">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-normal text-[#333333] mb-6 text-center">{getC('birth', 'title', "El nacimiento de Origen")}</h2>
              <p className="text-lg leading-relaxed text-gray-800 whitespace-pre-line text-left">
                {getC('birth', 'text', "Siguiendo ese legado, en 2013 un grupo de jóvenes colombianos, con una sólida trayectoria en Interact y Rotaract, decidió crear un club rotario diferente: uno que derribara las barreras de la distancia y uniera a socios en un espacio 100% virtual. Tras un año de preparación y consultas ante Rotary International, en 2015 nació oficialmente el Rotary E-Club Origen, el primero de su tipo en Colombia, fundado íntegramente por ex Interactianos y Rotaractianos.")}
              </p>
              
              {/* Socios Fundadores Infographic - Enhanced */}
              <div className="mt-16 relative">
                <div className="absolute inset-0 bg-sky-50/30 blur-3xl -z-10 rounded-full" />
                
                <div className="text-center mb-12">
                  <span className="bg-sky-100 text-rotary-blue text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-[0.2em]">
                    Legado y Liderazgo
                  </span>
                  <h3 className="text-3xl font-normal text-gray-800 mt-4">Nuestros Socios Fundadores</h3>
                  <div className="w-16 h-1 bg-rotary-gold mx-auto mt-4 rounded-full" />
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                  {ORIGEN_FOUNDERS.map((name, i) => {
                    if (!name) return <div key={i} className="hidden lg:block" />; // Spacer for grid alignment
                    
                    const isPastRDR = name.includes('Past RDR');
                    const [fullName, role] = name.split(' (');
                    const iconColor = isPastRDR ? 'text-rotary-gold' : 'text-rotary-blue';
                    const borderColor = isPastRDR ? 'border-rotary-gold/30' : 'border-gray-100';
                    
                    return (
                      <div key={i} className={`group relative bg-white/80 backdrop-blur-sm border ${borderColor} rounded-[32px] p-8 transition-all duration-500 hover:shadow-2xl hover:shadow-rotary-blue/10 hover:-translate-y-2`}>
                        <div className="flex flex-col items-center text-center gap-5">
                          <div className={`w-20 h-20 rounded-full bg-white shadow-inner flex items-center justify-center border-4 ${isPastRDR ? 'border-rotary-gold/20' : 'border-sky-50'}`}>
                            {isPastRDR ? (
                              <div className="relative">
                                <ShieldCheck className="w-10 h-10 text-rotary-gold animate-pulse-slow" />
                                <div className="absolute -top-1 -right-1 w-4 h-4 bg-rotary-blue rounded-full border-2 border-white" />
                              </div>
                            ) : (
                              <User className="w-10 h-10 text-rotary-blue opacity-40 group-hover:opacity-100 transition-opacity" />
                            )}
                          </div>
                          
                          <div>
                            <p className="text-xl font-medium text-gray-900 group-hover:text-rotary-blue transition-colors">
                              {fullName}
                            </p>
                            {role && (
                              <div className="mt-3">
                                <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full ${isPastRDR ? 'bg-rotary-gold/10 text-rotary-gold' : 'bg-sky-50 text-rotary-blue'}`}>
                                  {role.replace(')', '')}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {/* Decorative background element */}
                        <div className="absolute bottom-4 right-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                          <Star className="w-12 h-12" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Una década de impacto */}
            <div className="flex flex-col lg:flex-row overflow-hidden rounded-3xl shadow-xl ring-1 ring-gray-100 bg-white">
              <div className="lg:w-1/2 bg-rotary-navy p-8 md:p-16 flex flex-col justify-center">
                <h2 className="text-3xl font-medium text-white mb-6">Una década de impacto</h2>
                <p className="text-lg leading-relaxed text-white/90 whitespace-pre-line">
                  Desde entonces, el E-Club Origen ha liderado proyectos innovadores y solidarios en diversas regiones del país: la campaña #TodoPorNuestrosHéroes durante la pandemia de COVID-19, el programa Origen H2O que lleva agua segura a comunidades rurales, Origen Siembra para la reforestación y la educación ambiental, el embellecimiento urbano con Rotary Pinta Colombia, la entrega de sillas de ruedas a personas en condición de discapacidad, el fortalecimiento de hogares infantiles y juveniles, entre muchos otros.
                  {"\n\n"}
                  Gracias a la virtualidad y a la pasión de sus socios, el club ha logrado llegar a más de 10 ciudades en Colombia y mantener vínculos internacionales con Guatemala y Brasil, demostrando que la amistad y el servicio rotario no tienen fronteras.
                </p>
              </div>
              <div className="lg:w-1/2 h-[400px] lg:h-auto">
                <img src={timelineImage} alt="Impacto Origen" className="w-full h-full object-cover" />
              </div>
            </div>

            {/* Mirando al futuro */}
            <div className="max-w-4xl mx-auto">
              <h3 className="text-3xl font-normal text-[#333333] mb-6 text-center">Mirando al futuro</h3>
              <p className="text-lg leading-relaxed text-gray-800 whitespace-pre-line text-left">
                Hoy, en 2025, celebramos 10 años de historia reafirmando nuestro compromiso con la visión global de Rotary: soñar en grande, construir puentes de paz y servir con creatividad e innovación. Somos una familia rotaria que une corazones, multiplica voluntades y transforma comunidades, con la certeza de que nuestra mejor obra siempre será la próxima.
              </p>
            </div>
          </div>

          {/* Galería (Común para todos) */}
          <div>
            <h2 className="text-2xl font-medium text-gray-800 mb-6 text-center">Momentos Históricos</h2>
            <div className="relative aspect-video rounded-3xl overflow-hidden shadow-2xl ring-1 ring-gray-200 bg-black">
              <img
                src={galleryImages[currentImage]}
                alt={`Galería ${currentImage + 1}`}
                className="w-full h-full object-cover transition-transform duration-500"
              />
              <button
                onClick={() => setCurrentImage(p => (p - 1 + galleryImages.length) % galleryImages.length)}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-colors z-10"
              >
                <ChevronLeft className="w-6 h-6 text-gray-700" />
              </button>
              <button
                onClick={() => setCurrentImage(p => (p + 1) % galleryImages.length)}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-colors z-10"
              >
                <ChevronRight className="w-6 h-6 text-gray-700" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default NuestraHistoria;
