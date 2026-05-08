import { Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import CausesCarousel from '../sections/CausesCarousel';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';
import { useSiteImages } from '../hooks/useSiteImages';
import { useSEO } from '../hooks/useSEO';

const QuienesSomos = () => {
  const { club } = useClub();
  const { sections } = useCMSContent('quienes-somos', club.id);
  const siteImages = useSiteImages();

  useSEO({
    title: 'Quiénes Somos',
    description: `Conoce a ${(club as any)?.name || 'nuestro club Rotary'}: misión, visión y valores. Más de 110 años de servicio comunitario.`,
    path: '/quienes-somos',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: (club as any)?.name,
      description: `Club miembro de Rotary International dedicado al servicio comunitario.`,
      url: `https://${(club as any)?.domain || 'clubplatform.org'}`,
      logo: (club as any)?.logo,
      sameAs: ['https://www.rotary.org'],
    },
  });

  // Helper to get nested content or fallback
  const getC = (section: string, field: string, fallback: string) => {
    return sections[section]?.[field] || fallback;
  }

  const heroImage = siteImages.aboutHero?.url
    || getC('hero', 'image', "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1600&h=500&fit=crop");

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
          <h1 className="text-4xl md:text-5xl text-white">
            {getC('hero', 'title', "Quienes Somos")}
          </h1>
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
            {getC('intro', 'quote', "Rotary es una red mundial compuesta de 1.400.000 vecinos, amigos, líderes y personas dedicadas a solucionar problemas, quienes ven un planeta en que las personas se unen y toman acción para generar un cambio perdurable en el mundo, sus comunidades y en sí mismos.")}
          </p>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-20 md:py-28 bg-rotary-concrete">
        <div className="max-w-4xl mx-auto px-6 text-gray-800">
          {/* Intro paragraph */}
          <p className="text-lg leading-relaxed text-gray-800 mb-12">
            {getC('main', 'description', "Para resolver los problemas más acuciantes, la dedicación y la visión son requisitos indispensables. Por más de 110 años, la gente de acción de Rotary ha abordado los problemas más graves con pasión, energía y competencia. Ya se traten de proyectos de alfabetización, el fomento de la paz, y el acceso a fuentes de agua y atención de la salud, nos esforzamos por mejorar el mundo, siempre perseverantes hasta cumplir con nuestro cometido.")}
          </p>

          {/* Quote */}
          <div className="text-center mb-16">
              <h2 className="text-3xl md:text-[34px] font-normal text-gray-700 mb-8 leading-snug">
                {getC('main', 'highlight', "Más allá de lo que Rotary signifique para nosotros, el mundo lo conocerá por las obras que realice.")}
              </h2>
          </div>

          <div className="mb-12">
              {/* Description and list */}
              <p className="text-lg leading-relaxed text-gray-800 mb-6">
                {getC('main', 'listTitle', `Como socios de el club ${club.name} asumimos la responsabilidad de tomar acción, a fin de abordar los problemas más perniciosos que afectan a la humanidad. Unidos con nuestros 46 000 clubes:`)}
              </p>

              <ul className="space-y-4">
                {(sections['main']?.items || [
                  "Promovemos la paz",
                  "Combatimos enfermedades",
                  "Proporcionamos acceso al agua salubre",
                  "Protegemos a madres e hijos",
                  "Fomentamos la educación",
                  "Desarrollamos las economías locales",
                  "Protegemos el medioambiente"
                ]).map((item: string, i: number) => (
                  <li key={i} className="flex items-start">
                    <span className="mr-3 font-bold text-gray-700 mt-1">•</span>
                    <p className="text-lg text-gray-800">{item}</p>
                  </li>
                ))}
              </ul>
          </div>

          {/* Nuestra misión */}
          <div className="mb-12">
              <h3 className="text-3xl font-bold text-[#333333] mb-6">
                Nuestra misión
              </h3>
              <p className="text-lg leading-relaxed text-gray-800">
                {getC('mision', 'text', "Ese compromiso sigue vigente hoy gracias a una organización verdaderamente internacional. Apenas 16 años después de su fundación, Rotary contaba con clubes en todos los continentes. Nuestros socios están presentes en todos los rincones del mundo y trabajan para dar solución a los problemas más acuciantes del mundo.")}
              </p>
          </div>

          {/* Declaración de la visión */}
          <div className="mb-12">
              <h3 className="text-3xl font-bold text-[#333333] mb-6">
                Declaración de la visión
              </h3>
              <p className="text-lg leading-relaxed text-gray-800">
                {getC('vision', 'text', "Juntos contemplamos un mundo donde las personas se unen y toman acción para generar un cambio perdurable en nosotros mismos, en nuestras comunidades y en el mundo entero.")}
              </p>
          </div>

          {/* ¿Por qué nos diferenciamos? */}
          <div className="mb-12">
              <h3 className="text-3xl font-bold text-[#333333] mb-6">
                ¿Por qué nos diferenciamos?
              </h3>
              <ul className="space-y-4">
                {(sections['differences']?.items || [
                  { title: "Percibimos las cosas de manera distinta", desc: "Nos valemos de nuestra perspectiva multidisciplinaria para afrontar los desafíos desde diversos enfoques." },
                  { title: "Tenemos nuestra propia manera de pensar", desc: "Ponemos nuestro liderazgo y experiencia profesional a servicio de los demás para solucionar los problemas sociales que afectan a nuestras comunidades." },
                  { title: "Somos responsables", desc: "Con nuestra pasión y perseverancia generamos el cambio permanente." }
                ]).map((item: any, i: number) => (
                  <li key={i} className="flex items-start">
                    <span className="mr-3 font-bold text-gray-700 mt-1">•</span>
                    <p className="text-lg text-gray-800">
                        <span className="font-bold text-[#333333] block md:inline">{item.title}:</span> <span className="md:ml-1">{item.desc}</span>
                    </p>
                  </li>
                ))}
              </ul>
          </div>
        </div>
      </section>

      {/* Causes Carousel */}
      <div className="bg-rotary-geo">
        <CausesCarousel />
      </div>

      {/* CTA Section */}
      <section className="py-12 md:py-16 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl mb-6" style={{ color: '#39424a' }}>
            ¿Quieres escribir la historia con nosotros?
          </h2>
          <Link
            to="/involucrate"
            className="inline-flex items-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
          >
            <Star className="w-5 h-5 text-rotary-gold fill-rotary-gold" />
            Involúcrate en Rotary
          </Link>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default QuienesSomos;
