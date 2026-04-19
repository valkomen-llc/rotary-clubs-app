import { useState } from 'react';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
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
  "Natalia Giraldo",
  "Leidy Viviana Hurtado"
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
          <h1 className="text-4xl md:text-5xl text-white">Nuestra Historia</h1>
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
          <p className="text-white leading-tight font-light" style={{ fontSize: '28px' }}>
            Nuestra Historia
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-20 md:py-28 bg-rotary-concrete">
        <div className="max-w-4xl mx-auto px-6 text-gray-800 space-y-16">

          {/* Los orígenes de Rotary */}
          <div>
            <h2 className="text-3xl font-medium text-[#333333] mb-6 text-center">Los orígenes de Rotary</h2>
            <p className="text-lg leading-relaxed text-gray-800 whitespace-pre-line">
              Rotary nació en Chicago en 1905, cuando Paul Harris, un joven abogado, reunió a profesionales de distintas áreas con el propósito de intercambiar ideas, cultivar la amistad y servir a la comunidad. Lo que empezó como un pequeño círculo pronto se expandió a todos los continentes, convirtiéndose en una red mundial de líderes comprometidos con la paz, la salud, la educación y el desarrollo sostenible. Hoy, más de 1,4 millones de rotarios en más de 200 países continúan soñando en grande y haciendo realidad proyectos que transforman vidas.
            </p>
          </div>

          <div className="space-y-16">
            <div>
              <h2 className="text-3xl font-medium text-[#333333] mb-6 text-center">El nacimiento de Origen</h2>
              <p className="text-lg leading-relaxed text-gray-800 whitespace-pre-line">
                Siguiendo ese legado, en 2013 un grupo de jóvenes colombianos, con una sólida trayectoria en Interact y Rotaract, decidió crear un club rotario diferente: uno que derribara las barreras de la distancia y uniera a socios en un espacio 100% virtual. Tras un año de preparación y consultas ante Rotary International, en 2015 nació oficialmente el Rotary E-Club Origen, el primero de su tipo en Colombia, fundado íntegramente por ex Interactianos y Rotaractianos.
              </p>
              
              {/* Socios Fundadores */}
              <div className="mt-12">
                <p className="text-lg leading-relaxed text-gray-800 mb-6 text-left">
                  Como socios fundadores que dieron vida al sueño de Origen asumimos la responsabilidad de tomar acción:
                </p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ORIGEN_FOUNDERS.map((name, i) => (
                    <li key={i} className="flex items-start">
                      <span className="mr-3 font-bold text-gray-700 mt-1">•</span>
                      <p className="text-lg text-gray-800">{name}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Una década de impacto */}
            <div className="flex flex-col lg:flex-row overflow-hidden rounded-3xl shadow-xl ring-1 ring-gray-100">
              <div className="lg:w-1/2 bg-rotary-navy p-8 md:p-12 flex flex-col justify-center">
                <h2 className="text-3xl font-bold text-white mb-6">Una década de impacto</h2>
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
            <div className="mb-12">
              <h3 className="text-3xl font-medium text-[#333333] mb-6 text-center">Mirando al futuro</h3>
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
