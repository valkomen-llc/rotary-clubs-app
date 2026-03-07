import { useState } from 'react';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

const galleryImages = [
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=500&fit=crop',
  'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=500&fit=crop',
  'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&h=500&fit=crop',
  'https://images.unsplash.com/photo-1582213782179-e0d53f98f2ca?w=800&h=500&fit=crop'
];

const NuestraHistoria = () => {
  const [currentImage, setCurrentImage] = useState(0);

  const nextImage = () => {
    setCurrentImage((prev) => (prev + 1) % galleryImages.length);
  };

  const prevImage = () => {
    setCurrentImage((prev) => (prev - 1 + galleryImages.length) % galleryImages.length);
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section - Historical Image */}
      <section className="relative w-full h-[350px] md:h-[450px] overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&h=500&fit=crop"
            alt="Rotary Historical"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/20" />
        </div>
      </section>

      {/* Title Section - Blue Background */}
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
          <h1 className="text-3xl md:text-4xl font-bold text-white">Nuestra Historia</h1>
        </div>
      </section>

      {/* Intro Content Section */}
      <section className="py-12 md:py-16 bg-rotary-concrete">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Intro paragraphs */}
          <p className="text-gray-600 leading-relaxed mb-6">
            Rotary nace con la visión de un hombre, Paul Harris, abogado de Chicago quien fundó el Club Rotario de Chicago un 23 de febrero de 1905. Su propósito fue formar un círculo de profesionales dedicados a diversos campos con miras a propiciar el intercambio de ideas y la forja de lazos de amistad.
          </p>

          <p className="text-gray-600 leading-relaxed mb-10">
            Con el tiempo, el alcance y la visión de Rotary se extendieron gradualmente al servicio humanitario. Nuestros socios cuentan con una larga trayectoria abordando desafíos en sus comunidades y en todo el mundo.
          </p>

          {/* Quote */}
          <div className="mb-10">
            <h2 className="text-2xl md:text-3xl font-medium text-gray-700 mb-6 leading-tight">
              «Más allá de lo que Rotary signifique para nosotros, el mundo lo conocerá por las obras que realice.»
            </h2>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-200">
                <img
                  src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face"
                  alt="Paul Harris"
                  className="w-full h-full object-cover"
                />
              </div>
              <div>
                <p className="font-bold text-gray-800">Paul Harris</p>
                <p className="text-sm text-gray-500">Fundador de Rotary</p>
              </div>
            </div>
          </div>

          {/* Nuestro compromiso permanente */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Nuestro compromiso permanente</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              Ese compromiso sigue vigente hoy gracias a una organización verdaderamente internacional. Apenas 16 años después de su fundación, Rotary contaba con clubes en todos los continentes. Nuestros socios están presentes en todos los rincones del mundo y trabajan para dar solución a los problemas más acuciantes del mundo.
            </p>
            <p className="text-gray-600 leading-relaxed">
              No tenemos miedo de soñar a lo grande y fijarnos metas ambiciosas. En 1979, lanzamos nuestra campaña contra la polio con un proyecto para vacunar a seis millones de niños en Filipinas. Hoy en día, la polio es endémica en solo dos países, en comparación con 125 en 1988.
            </p>
          </div>

        </div>
      </section>

      {/* Cronología de Rotary - Split Box */}
      <section className="py-8 md:py-12 bg-rotary-concrete">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row overflow-hidden rounded-lg shadow-xl">
            {/* Left Side - Blue Background */}
            <div className="md:w-1/2 bg-rotary-navy p-8 md:p-12 flex flex-col justify-center">
              <h3 className="text-xl md:text-2xl font-bold text-white mb-4">Cronología de Rotary</h3>
              <p className="text-white/80 leading-relaxed mb-8">
                Nuestros 1,4 millones de socios se unen a los líderes comunitarios, amigos y aliados en una red global que aborda desafíos en todo el mundo.
              </p>
              <button className="border border-white text-white font-semibold py-3 px-8 rounded-full hover:bg-white hover:text-rotary-navy transition-all uppercase text-sm tracking-wider w-fit">
                Más Información
              </button>
            </div>

            {/* Right Side - Image */}
            <div className="md:w-1/2">
              <img
                src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=400&fit=crop"
                alt="Rotary History"
                className="w-full h-full object-cover min-h-[300px]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Main Content - Los orígenes de Rotary */}
      <section className="py-12 md:py-16 bg-rotary-concrete">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

          {/* Los orígenes de Rotary */}
          <div className="mb-10">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Los orígenes de Rotary</h2>
            <p className="text-gray-600 leading-relaxed">
              Rotary nació en Chicago en 1905, cuando Paul Harris, un joven abogado, reunió a profesionales de distintas áreas con el propósito de intercambiar ideas, cultivar la amistad y servir a la comunidad. Lo que empezó como un pequeño círculo pronto se expandió a todos los continentes, convirtiéndose en una red mundial de líderes comprometidos con la paz, la salud, la educación y el desarrollo sostenible. Hoy, más de 1,4 millones de rotarios en más de 200 países continúan soñando en grande y haciendo realidad proyectos que transforman vidas.
            </p>
          </div>

          {/* El nacimiento de Origen */}
          <div className="mb-10">
            <h2 className="text-xl font-bold text-gray-800 mb-4">El nacimiento de Origen</h2>
            <p className="text-gray-600 leading-relaxed mb-6">
              Siguiendo ese legado, en 2013 un grupo de jóvenes colombianos, con una sólida trayectoria en Interact y Rotaract, decidió crear un club rotario diferente: uno que derribara las barreras de la distancia y uniera a socios en un espacio 100% virtual. Tras un año de preparación y consultas ante Rotary International, en 2015 nació oficialmente el <strong>Rotary Club</strong>, el primero de su tipo en Colombia, fundado íntegramente por ex Interactianos y Rotaractianos.
            </p>

            <p className="text-gray-600 mb-4">Los <strong>socios fundadores</strong> que dieron vida al sueño de Origen fueron:</p>

            <ul className="space-y-3 text-gray-600 ml-4">
              <li className="flex items-start gap-2">
                <span className="text-rotary-blue">•</span>
                <span><strong>Ricardo Jaramillo</strong> (Past RDR 2008–2009)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rotary-blue">•</span>
                <span><strong>Andrés Patiño</strong> (Past RDR 2009–2010)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rotary-blue">•</span>
                <span><strong>Lucas Lasso</strong> (Past RDR 2010–2011)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rotary-blue">•</span>
                <span><strong>Israel David Castellanos</strong> (Past RDR 2011–2012)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rotary-blue">•</span>
                <span><strong>Luz Adriana Bermúdez</strong> (Past RDR 2012–2013)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rotary-blue">•</span>
                <span><strong>Natalia Giraldo</strong></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rotary-blue">•</span>
                <span><strong>Leidy Viviana Hurtado</strong></span>
              </li>
            </ul>
          </div>

          {/* Una década de impacto */}
          <div className="mb-10">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Una década de impacto</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              Desde entonces, el Rotary Club ha liderado proyectos innovadores y solidarios en diversas regiones del país: la campaña <strong>#TodoPorNuestrosHéroes</strong> durante la pandemia de COVID-19, el programa <strong>Origen H2O</strong> que lleva agua segura a comunidades rurales, <strong>Origen Siembra</strong> para la reforestación y la educación ambiental, el embellecimiento urbano con <strong>Rotary Pinta Colombia</strong>, la entrega de <strong>sillas de ruedas</strong> a personas en condición de discapacidad, el fortalecimiento de hogares infantiles y juveniles, entre muchos otros.
            </p>
            <p className="text-gray-600 leading-relaxed">
              Gracias a la virtualidad y a la pasión de sus socios, el club ha logrado llegar a más de 10 ciudades en Colombia y mantener vínculos internacionales con Guatemala y Brasil, demostrando que la amistad y el servicio rotario no tienen fronteras.
            </p>
          </div>

          {/* Mirando al futuro */}
          <div className="mb-12">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Mirando al futuro</h2>
            <p className="text-gray-600 leading-relaxed">
              Hoy, en 2025, celebramos 10 años de historia reafirmando nuestro compromiso con la visión global de Rotary: soñar en grande, construir puentes de paz y servir con creatividad e innovación. Somos una familia rotaria que une corazones, multiplica voluntades y transforma comunidades, con la certeza de que nuestra mejor obra siempre será la próxima.
            </p>
          </div>

        </div>
      </section>

      {/* Image Gallery Carousel */}
      <section className="py-8 bg-rotary-concrete">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative">
            {/* Main Image */}
            <div className="relative overflow-hidden rounded-lg shadow-lg aspect-[16/9]">
              <img
                src={galleryImages[currentImage]}
                alt={`Gallery image ${currentImage + 1}`}
                className="w-full h-full object-cover transition-transform duration-500"
              />

              {/* Navigation Arrows */}
              <button
                onClick={prevImage}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-700" />
              </button>
              <button
                onClick={nextImage}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 hover:bg-white rounded-full shadow-lg flex items-center justify-center transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-700" />
              </button>
            </div>

            {/* Dots Indicator */}
            <div className="flex justify-center gap-2 mt-4">
              {galleryImages.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentImage(index)}
                  className={`
                    w-2 h-2 rounded-full transition-all
                    ${index === currentImage ? 'bg-rotary-blue w-6' : 'bg-gray-300'}
                  `}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Explora nuestros archivos - Split Box */}
      <section className="py-8 md:py-12 bg-rotary-concrete">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row overflow-hidden rounded-lg shadow-xl">
            {/* Left Side - Historical Image */}
            <div className="md:w-1/2">
              <img
                src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=500&fit=crop"
                alt="Archivos históricos de Rotary"
                className="w-full h-full object-cover min-h-[350px]"
              />
            </div>

            {/* Right Side - Cyan Background */}
            <div className="md:w-1/2 bg-[#4A9CB8] p-8 md:p-12 flex flex-col justify-center">
              <h3 className="text-xl md:text-2xl font-bold text-white mb-6">Explora nuestros archivos</h3>
              <p className="text-white/90 leading-relaxed mb-8">
                Los archivos de Rotary incluyen decenas de miles de fotografías, grabaciones, publicaciones y artefactos que preservan nuestro legado. ¿Estás llevando a cabo una investigación? Los socios de Rotary, el personal de Rotary y el público en general pueden visitar los archivos mediante cita previa. Obtén más información sobre los artículos que conservamos, cómo podríamos ayudarte y cómo solicitar una cita para examinar nuestro material.
              </p>
              <a href="#" className="text-white font-semibold underline underline-offset-4 hover:text-white/80 transition-colors w-fit">
                Más información
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-12 md:py-16 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-rotary-blue mb-6">
            ¿Quieres escribir la historia con nosotros?
          </h2>
          <button
            className="inline-flex items-center gap-2 bg-sky-100 hover:bg-sky-200 text-rotary-blue font-medium px-8 py-3.5 rounded-full transition-all duration-300 shadow-lg"
          >
            <Star className="w-5 h-5 text-rotary-gold fill-rotary-gold" />
            Involúcrate en Rotary
          </button>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default NuestraHistoria;
