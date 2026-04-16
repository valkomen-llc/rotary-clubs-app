import { useState } from 'react';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';
import { useSiteImages } from '../hooks/useSiteImages';

const NuestraHistoria = () => {
  const { club } = useClub();
  const { sections } = useCMSContent('nuestra-historia', club.id);
  const images = useSiteImages();
  const [currentImage, setCurrentImage] = useState(0);

  const getC = (section: string, field: string, fallback: string) => {
    return sections[section]?.[field] || fallback;
  }

  const heroImage = images?.history?.[0]?.url || "https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&h=500&fit=crop";
  const timelineImage = images?.history?.[1]?.url || "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop";
  
  const galleryImages = [
    images?.history?.[2]?.url || 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=500&fit=crop',
    images?.history?.[3]?.url || 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&h=500&fit=crop',
    images?.history?.[4]?.url || 'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=800&h=500&fit=crop'
  ];

  const nextImage = () => {
    setCurrentImage((prev) => (prev + 1) % galleryImages.length);
  };

  const prevImage = () => {
    setCurrentImage((prev) => (prev - 1 + galleryImages.length) % galleryImages.length);
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <section className="relative w-full h-[350px] md:h-[450px] overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="Rotary Historical"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/20" />
        </div>
      </section>

      {/* Title Section */}
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
          <h1 className="text-white" style={{ fontSize: '35px' }}>
            {getC('header', 'title', "Nuestra Historia")}
          </h1>
          <p className="text-white/80 mt-2 italic text-lg opacity-90">
            {getC('header', 'subtitle', club.name)}
          </p>
        </div>
      </section>

      {/* Intro + Content Section */}
      <section className="bg-rotary-concrete" style={{ paddingTop: '48px', paddingBottom: '64px' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          
          {/* Intro paragraphs */}
          <p className="text-xl md:text-2xl text-gray-700 leading-relaxed font-light text-center max-w-4xl mx-auto" style={{ marginBottom: '48px' }}>
            {getC('intro', 'p1', "Rotary nace con la visión de un hombre, Paul Harris, abogado de Chicago quien fundó el Club Rotario de Chicago un 23 de febrero de 1905.")}
            <br className="my-4 block" />
            {getC('intro', 'p2', "Con el tiempo, el alcance y la visión de Rotary se extendieron gradualmente al servicio humanitario.")}
          </p>

          {/* Quote */}
          <div className="max-w-4xl mx-auto text-center" style={{ marginTop: '80px' }}>
            <h2 className="text-2xl md:text-3xl font-light text-gray-700 mb-6 leading-tight italic">
              {getC('quote', 'text', "«Más allá de lo que Rotary signifique para nosotros, el mundo lo conocerá por las obras que realice.»")}
            </h2>
            <div className="flex flex-col items-center gap-3">
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden bg-gray-200">
                <img
                  src={getC('quote', 'authorImage', "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face")}
                  alt="Author"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <p className="font-bold text-gray-800 text-lg">{getC('quote', 'authorName', "Paul Harris")}</p>
                <p className="text-sm text-gray-500">{getC('quote', 'authorRole', "Fundador de Rotary")}</p>
              </div>
            </div>
          </div>

          {/* Compromiso Local */}
          <div className="max-w-4xl mx-auto text-center" style={{ marginTop: '80px' }}>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">
              {getC('local', 'title', `Nuestra historia en ${club.city || 'Bogotá'}`)}
            </h2>
            <p className="text-gray-600 leading-relaxed text-lg whitespace-pre-line">
              {getC('local', 'content', "Ese compromiso sigue vigente hoy gracias a una organización verdaderamente internacional.")}
            </p>
          </div>

          {/* Cronología - Split Box */}
          <div className="flex flex-col lg:flex-row overflow-hidden rounded-3xl shadow-xl ring-1 ring-gray-100" style={{ marginTop: '80px' }}>
            <div className="lg:w-1/2 bg-rotary-navy p-8 md:p-12 flex flex-col justify-center">
              <h3 className="text-3xl md:text-4xl font-bold text-white mb-6">
                {getC('timeline', 'title', "Décadas de Impacto")}
              </h3>
              <p className="text-lg leading-relaxed mb-8 opacity-90 text-white whitespace-pre-line">
                {getC('timeline', 'description', "Nuestros socios se unen a los líderes comunitarios, amigos y aliados en una red global que aborda desafíos en todo el mundo.")}
              </p>
            </div>
            <div className="lg:w-1/2 h-[300px] lg:h-auto">
              <img
                src={timelineImage}
                alt="Rotary History"
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Image Gallery */}
          <div className="max-w-5xl mx-auto" style={{ marginTop: '80px' }}>
            <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">Momentos Históricos</h2>
            <div className="relative aspect-video rounded-3xl overflow-hidden shadow-2xl ring-1 ring-gray-200 bg-black">
              <img
                src={galleryImages[currentImage]}
                alt={`Gallery image ${currentImage + 1}`}
                className="w-full h-full object-cover transition-transform duration-500"
              />

              <button
                onClick={prevImage}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-colors z-10"
                aria-label="Imagen anterior"
              >
                <ChevronLeft className="w-6 h-6 text-gray-700" />
              </button>
              <button
                onClick={nextImage}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-colors z-10"
                aria-label="Siguiente imagen"
              >
                <ChevronRight className="w-6 h-6 text-gray-700" />
              </button>
            </div>

            <div className="flex justify-center gap-2 mt-6">
              {galleryImages.map((_: any, index: number) => (
                <button
                  key={index}
                  onClick={() => setCurrentImage(index)}
                  className={`
                    w-2.5 h-2.5 rounded-full transition-all
                    ${index === currentImage ? 'bg-rotary-blue w-8' : 'bg-gray-300'}
                  `}
                  aria-label={`Ir a imagen ${index + 1}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 md:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-rotary-blue mb-6">
            ¿Quieres ser parte de nuestra historia?
          </h2>
          <button
            className="inline-flex items-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
          >
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
