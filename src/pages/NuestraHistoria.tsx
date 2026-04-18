import { useState } from 'react';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';
import { useSiteImages } from '../hooks/useSiteImages';

const DEFAULT_FOUNDERS = `Ricardo Jaramillo (Past RDR 2008–2009)
Andrés Patiño (Past RDR 2009–2010)
Lucas Lasso (Past RDR 2010–2011)
Israel David Castellanos (Past RDR 2011–2012)
Luz Adriana Bermúdez (Past RDR 2012–2013)
Natalia Giraldo
Leidy Viviana Hurtado`;

const NuestraHistoria = () => {
  const { club } = useClub();
  const { sections } = useCMSContent('nuestra-historia', club.id);
  const images = useSiteImages();
  const [currentImage, setCurrentImage] = useState(0);

  const getC = (section: string, field: string, fallback: string) =>
    sections[section]?.[field] || fallback;

  const heroImage = images?.history?.[0]?.url || 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&h=500&fit=crop';
  const timelineImage = images?.history?.[1]?.url || 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop';

  const galleryImages = [
    images?.history?.[2]?.url || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=500&fit=crop',
    images?.history?.[3]?.url || 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&h=500&fit=crop',
    images?.history?.[4]?.url || 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=800&h=500&fit=crop',
  ];

  const foundersRaw = getC('founders', 'list', DEFAULT_FOUNDERS);
  const foundersList = foundersRaw.split('\n').map(s => s.trim()).filter(Boolean);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="relative w-full h-[350px] md:h-[450px] overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroImage} alt="Rotary Historia" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/20" />
        </div>
      </section>

      {/* Title Block */}
      <section
        className="py-12 md:py-16"
        style={{
          backgroundColor: '#0c3c7c',
          backgroundImage: "url('/geo-darkblue.png')",
          backgroundPosition: '50% 0',
          backgroundRepeat: 'repeat',
          backgroundSize: '71px 85px',
        }}
      >
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-white" style={{ fontSize: '35px' }}>
            {getC('header', 'title', 'Nuestra Historia')}
          </h1>
          <p className="text-white/80 mt-2 italic text-lg opacity-90">
            {getC('header', 'subtitle', club.name)}
          </p>
        </div>
      </section>

      {/* Cuerpo principal */}
      <section className="bg-rotary-concrete" style={{ paddingTop: '56px', paddingBottom: '72px' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">

          {/* Los orígenes de Rotary */}
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-rotary-blue mb-5 text-center">
              {getC('origins', 'title', 'Los orígenes de Rotary')}
            </h2>
            <p className="text-lg text-gray-700 leading-relaxed font-light text-center whitespace-pre-line">
              {getC('origins', 'content', 'Rotary nació en Chicago en 1905, cuando Paul Harris, un joven abogado, reunió a profesionales de distintas áreas con el propósito de intercambiar ideas, cultivar la amistad y servir a la comunidad. Lo que empezó como un pequeño círculo pronto se expandió a todos los continentes, convirtiéndose en una red mundial de líderes comprometidos con la paz, la salud, la educación y el desarrollo sostenible. Hoy, más de 1,4 millones de rotarios en más de 200 países continúan soñando en grande y haciendo realidad proyectos que transforman vidas.')}
            </p>
          </div>

          {/* El nacimiento de Origen */}
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-rotary-blue mb-5 text-center">
              {getC('local', 'title', 'El nacimiento de Origen')}
            </h2>
            <p className="text-lg text-gray-700 leading-relaxed font-light text-center whitespace-pre-line">
              {getC('local', 'content', 'Siguiendo ese legado, en 2013 un grupo de jóvenes colombianos, con una sólida trayectoria en Interact y Rotaract, decidió crear un club rotario diferente: uno que derribara las barreras de la distancia y uniera a socios en un espacio 100% virtual. Tras un año de preparación y consultas ante Rotary International, en 2015 nació oficialmente el Rotary E-Club Origen, el primero de su tipo en Colombia, fundado íntegramente por ex Interactianos y Rotaractianos.')}
            </p>

            {/* Socios fundadores */}
            <div className="mt-10">
              <h3 className="text-xl font-semibold text-gray-800 mb-6 text-center">
                {getC('founders', 'title', 'Los socios fundadores que dieron vida al sueño de Origen fueron:')}
              </h3>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
                {foundersList.map((name, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 bg-white rounded-xl px-5 py-3 shadow-sm border border-gray-100"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-rotary-gold flex-shrink-0" />
                    <span className="text-gray-700 text-sm font-medium">{name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Una década de impacto — Split box */}
          <div className="flex flex-col lg:flex-row overflow-hidden rounded-3xl shadow-xl ring-1 ring-gray-100">
            <div className="lg:w-1/2 bg-rotary-navy p-8 md:p-12 flex flex-col justify-center">
              <h2 className="text-2xl md:text-3xl font-bold text-white mb-5">
                {getC('timeline', 'title', 'Una década de impacto')}
              </h2>
              <p className="text-base leading-relaxed text-white/90 whitespace-pre-line">
                {getC('timeline', 'description', 'Desde entonces, el E-Club Origen ha liderado proyectos innovadores y solidarios en diversas regiones del país: la campaña #TodoPorNuestrosHéroes durante la pandemia de COVID-19, el programa Origen H2O que lleva agua segura a comunidades rurales, Origen Siembra para la reforestación y la educación ambiental, el embellecimiento urbano con Rotary Pinta Colombia, la entrega de sillas de ruedas a personas en condición de discapacidad, el fortalecimiento de hogares infantiles y juveniles, entre muchos otros.\n\nGracias a la virtualidad y a la pasión de sus socios, el club ha logrado llegar a más de 10 ciudades en Colombia y mantener vínculos internacionales con Guatemala y Brasil, demostrando que la amistad y el servicio rotario no tienen fronteras.')}
              </p>
            </div>
            <div className="lg:w-1/2 h-[300px] lg:h-auto">
              <img src={timelineImage} alt="Rotary Historia" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Mirando al futuro */}
          <div className="bg-white rounded-3xl shadow-sm ring-1 ring-gray-100 p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-rotary-blue mb-5">
              {getC('future', 'title', 'Mirando al futuro')}
            </h2>
            <p className="text-lg text-gray-700 leading-relaxed font-light whitespace-pre-line">
              {getC('future', 'content', 'Hoy, en 2025, celebramos 10 años de historia reafirmando nuestro compromiso con la visión global de Rotary: soñar en grande, construir puentes de paz y servir con creatividad e innovación. Somos una familia rotaria que une corazones, multiplica voluntades y transforma comunidades, con la certeza de que nuestra mejor obra siempre será la próxima.')}
            </p>
          </div>

          {/* Galería de momentos históricos */}
          <div>
            <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Momentos Históricos</h2>
            <div className="relative aspect-video rounded-3xl overflow-hidden shadow-2xl ring-1 ring-gray-200 bg-black">
              <img
                src={galleryImages[currentImage]}
                alt={`Galería ${currentImage + 1}`}
                className="w-full h-full object-cover transition-transform duration-500"
              />
              <button
                onClick={() => setCurrentImage(p => (p - 1 + galleryImages.length) % galleryImages.length)}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-colors z-10"
                aria-label="Imagen anterior"
              >
                <ChevronLeft className="w-6 h-6 text-gray-700" />
              </button>
              <button
                onClick={() => setCurrentImage(p => (p + 1) % galleryImages.length)}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-colors z-10"
                aria-label="Siguiente imagen"
              >
                <ChevronRight className="w-6 h-6 text-gray-700" />
              </button>
            </div>
            <div className="flex justify-center gap-2 mt-6">
              {galleryImages.map((_: any, i: number) => (
                <button
                  key={i}
                  onClick={() => setCurrentImage(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${i === currentImage ? 'bg-rotary-blue w-8' : 'bg-gray-300'}`}
                  aria-label={`Ir a imagen ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 md:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-rotary-blue mb-6">
            ¿Quieres ser parte de nuestra historia?
          </h2>
          <button className="inline-flex items-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg">
            <Star className="w-5 h-5 text-rotary-gold fill-rotary-gold" />
            Únete al club {club.name}
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default NuestraHistoria;
