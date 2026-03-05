import {
  FileText,
  Download,
  Calendar,
  Users,
  Globe,
  Clock,
  DollarSign,
  MapPin,
  MessageCircle,
  Instagram,
  Facebook,
  ChevronRight,
  Play
} from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

const documentos = [
  { id: 1, titulo: 'Convocatoria 2025-26 - Candidatos Intercambio', icono: <FileText className="w-5 h-5" /> },
  { id: 2, titulo: 'Convocatoria 2026-27 - Estudiantes Subsidiados', icono: <FileText className="w-5 h-5" /> },
  { id: 3, titulo: 'Formato Presentación Outbound Distrito 4281', icono: <Download className="w-5 h-5" /> },
  { id: 4, titulo: 'Presentación del Programa de Intercambios de Jóvenes', icono: <FileText className="w-5 h-5" /> },
  { id: 5, titulo: 'Convocatoria para Presentar Candidatos de Intercambio', icono: <FileText className="w-5 h-5" /> },
  { id: 6, titulo: 'Reglamento Distrital de Intercambio de Jóvenes de Rotary', icono: <FileText className="w-5 h-5" /> },
];

const ventajas = [
  'Adquirir destrezas de liderazgo que les servirán toda la vida',
  'Aprender un nuevo idioma y explorar otra cultura',
  'Forjar amistades duraderas con jóvenes del mundo entero',
  'Convertirse en ciudadanos del mundo'
];

const costos = [
  'Pasaje aéreo de ida y vuelta',
  'Seguro de viajes',
  'Tramitación de documentos (pasaporte y visados)',
  'Dinero para gastos personales, excursiones, paseos'
];

const IntercambioJovenes = () => {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <section className="relative w-full h-[500px] md:h-[600px] overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1600&h=800&fit=crop"
            alt="Intercambio de Jóvenes Rotary"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-rotary-navy/90 via-rotary-navy/70 to-transparent" />
        </div>
        <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Intercambio de Jóvenes de Rotary
            </h1>
            <p className="text-white/90 text-lg md:text-xl leading-relaxed">
              El Programa de Intercambio de Jóvenes del Distrito 4281 de Rotary hace parte de una red global con 22 países aliados. Todos nuestros estudiantes entrantes y salientes participan mediante convenios directos liderados por rotarios comprometidos con la paz y el liderazgo juvenil.
            </p>
          </div>
        </div>
      </section>

      {/* ¿Te interesa vivir una experiencia? */}
      <section className="py-16 md:py-24 bg-rotary-concrete">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                ¿Te interesa vivir una experiencia como estudiante de intercambio?
              </h2>
              <div className="space-y-4 text-gray-700 leading-relaxed">
                <p>
                  Como participante del Programa de Intercambio de Jóvenes de Rotary, puedes vivir hasta un año en otro país, compartir con familias anfitrionas y asistir a un colegio local. Más de 8.000 jóvenes al año viven esta experiencia única con Rotary.
                </p>
                <p className="font-semibold text-rotary-blue">
                  ¡Es una oportunidad que transforma vidas!
                </p>
                <p>
                  En el Distrito 4281 contamos con dos modalidades: el intercambio de corto plazo (aprox. un mes) y el de largo plazo (un año académico). En cualquiera de ellos descubrirás nuevas formas de vida, aprenderás sobre ti mismo y tal vez incluso un nuevo idioma.
                </p>
                <p>
                  Además, serás un embajador de tu país, tu cultura y tus valores. ¡Ayuda a conectar el mundo y haz amistades inolvidables en el camino!
                </p>
              </div>
            </div>
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=600&h=500&fit=crop"
                alt="Jóvenes en intercambio"
                className="rounded-2xl shadow-xl w-full h-auto object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ¿Listo para comenzar tu viaje rotario? */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">
                ¿Listo para comenzar tu viaje rotario?
              </h2>
              <p className="text-gray-700 mb-8 leading-relaxed">
                Descarga aquí todos los formularios y formatos necesarios para postularte al Programa de Intercambio de Jóvenes del Distrito 4281
              </p>

              {/* Lista de documentos */}
              <div className="space-y-3">
                {documentos.map((doc) => (
                  <a
                    key={doc.id}
                    href="#"
                    className="flex items-center gap-3 p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-100 group"
                  >
                    <span className="text-rotary-blue group-hover:text-rotary-gold transition-colors">
                      {doc.icono}
                    </span>
                    <span className="text-gray-700 text-sm md:text-base group-hover:text-rotary-blue transition-colors">
                      {doc.titulo}
                    </span>
                    <ChevronRight className="w-4 h-4 text-gray-400 ml-auto group-hover:translate-x-1 transition-transform" />
                  </a>
                ))}
              </div>
            </div>

            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=600&h=700&fit=crop"
                alt="Estudiantes de intercambio"
                className="rounded-2xl shadow-xl w-full h-auto object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ¡Atrévete a cruzar fronteras! */}
      <section className="py-16 md:py-24 bg-rotary-navy">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
                ¡Atrévete a cruzar fronteras, descubrir culturas y transformar tu mundo. El intercambio es solo el comienzo!
              </h2>
              <div className="flex items-center gap-2 text-white/80">
                <Globe className="w-5 h-5 text-rotary-gold" />
                <span>Conectemos por un mundo sin fronteras</span>
              </div>
            </div>
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=500&fit=crop"
                alt="Jóvenes conectando el mundo"
                className="rounded-2xl shadow-xl w-full h-auto object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Información del programa */}
      <section className="py-16 md:py-24 bg-rotary-concrete">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl md:text-3xl font-bold text-center text-gray-900 mb-4">
            Mediante el Intercambio de Jóvenes construimos la paz una persona a la vez.
          </h2>
          <p className="text-gray-600 text-center mb-12 leading-relaxed">
            El programa ofrece a los participantes la oportunidad de aprender un idioma, descubrir otras culturas y convertirse en ciudadanos del mundo. Los clubes rotarios patrocinan Intercambios de Jóvenes para escolares de 15 a 18 años en más de 100 países.
          </p>

          {/* ¿Qué ventajas ofrece? */}
          <div className="mb-12">
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-6 h-6 text-rotary-blue" />
              ¿Qué ventajas ofrece?
            </h3>
            <p className="text-gray-600 mb-4">Los intercambistas alcanzan su verdadero potencial al:</p>
            <ul className="space-y-2">
              {ventajas.map((ventaja, index) => (
                <li key={index} className="flex items-start gap-2 text-gray-700">
                  <span className="text-rotary-blue font-bold">–</span>
                  <span>{ventaja}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ¿Cuánto duran los intercambios? */}
          <div className="mb-12">
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Clock className="w-6 h-6 text-rotary-blue" />
              ¿Cuánto duran los intercambios?
            </h3>
            <div className="space-y-4 text-gray-700 leading-relaxed">
              <p>
                Los intercambios a <strong>largo plazo</strong> duran un año lectivo, durante el cual los participantes asisten a escuelas de la localidad y se alojan con varias familias anfitrionas.
              </p>
              <p>
                Los intercambios a <strong>corto plazo</strong> duran de varios días a tres meses y se realizan, por lo general, durante las vacaciones escolares, y pueden adoptar la forma de campamentos, visitas guiadas o estadías hogareñas.
              </p>
            </div>
          </div>

          {/* ¿Cuál es el costo? */}
          <div className="mb-12">
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-rotary-blue" />
              ¿Cuál es el costo?
            </h3>
            <p className="text-gray-700 mb-4 leading-relaxed">
              Los participantes reciben alojamiento y comida al igual que asistencia gratuita a la escuelas. Los costos varían según el país, y los participantes, por lo general, cubren los siguientes gastos:
            </p>
            <ul className="space-y-2">
              {costos.map((costo, index) => (
                <li key={index} className="flex items-start gap-2 text-gray-700">
                  <span className="text-rotary-blue font-bold">–</span>
                  <span>{costo}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ¿Cómo postulo? */}
          <div className="mb-12">
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <MapPin className="w-6 h-6 text-rotary-blue" />
              ¿Cómo postulo?
            </h3>
            <p className="text-gray-700 leading-relaxed">
              El programa está dirigido a chicos y chicas de <strong>15 a 18 años</strong> que demuestran habilidades de liderazgo en el colegio y la comunidad. Contacta con el club rotario más cercano para averiguar acerca de los programas de intercambio que ofrece y los trámites de solicitud.
            </p>
          </div>
        </div>
      </section>

      {/* Video Section */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-6 text-center">
            Introcamp 2024: ¡Así recibimos a 63 estudiantes de intercambio en Colombia!
          </h3>
          <div className="relative aspect-video rounded-2xl overflow-hidden shadow-xl bg-rotary-navy">
            <div className="absolute inset-0 flex items-center justify-center">
              <button className="w-20 h-20 bg-rotary-gold hover:bg-yellow-500 rounded-full flex items-center justify-center transition-colors shadow-lg">
                <Play className="w-8 h-8 text-white ml-1" fill="white" />
              </button>
            </div>
            <img
              src="https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800&h=450&fit=crop"
              alt="Video thumbnail"
              className="w-full h-full object-cover opacity-50"
            />
          </div>
        </div>
      </section>

      {/* Conectemos por un mundo sin fronteras */}
      <section className="py-16 md:py-24 bg-rotary-navy">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                Conectemos por un mundo sin fronteras
              </h2>
              <p className="text-white/80 leading-relaxed mb-8">
                Ya seas estudiante, padre, rotario o voluntario, estamos aquí para acompañarte en esta gran aventura. ¡Mantente informado, contáctanos o síguenos en redes!
              </p>

              {/* Botones de contacto */}
              <div className="space-y-3">
                <a
                  href="#"
                  className="flex items-center gap-3 p-4 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                >
                  <MessageCircle className="w-5 h-5 text-rotary-gold" />
                  <span>¿Tienes dudas o necesitas más información? Escríbenos.</span>
                </a>
                <a
                  href="#"
                  className="flex items-center gap-3 p-4 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                >
                  <Calendar className="w-5 h-5 text-rotary-gold" />
                  <span>Noticias, convocatorias y actualizaciones del programa</span>
                </a>
                <a
                  href="#"
                  className="flex items-center gap-3 p-4 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                >
                  <Instagram className="w-5 h-5 text-rotary-gold" />
                  <span>Síguenos y vive el intercambio en Instagram</span>
                </a>
                <a
                  href="#"
                  className="flex items-center gap-3 p-4 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
                >
                  <Facebook className="w-5 h-5 text-rotary-gold" />
                  <span>Únete a nuestra comunidad en Facebook</span>
                </a>
              </div>
            </div>

            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1593113598332-cd288d649433?w=600&h=500&fit=crop"
                alt="Jóvenes conectando el mundo"
                className="rounded-2xl shadow-xl w-full h-auto object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default IntercambioJovenes;
