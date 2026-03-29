import {
  FileText,
  Download,
  Users,
  DollarSign,
  ChevronRight,
  CheckCircle,
  Globe,
  MapPin,
  DownloadCloud
} from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import YEPHero from '../sections/YEPHero';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';

const IntercambioJovenes = () => {
  const { club } = useClub();
  const { sections } = useCMSContent('intercambio-jovenes', club.id);

  const getC = (section: string, field: string, fallback: string) => {
    return sections[section]?.[field] || fallback;
  }

  const defaultDocumentos = [
    { id: 1, titulo: 'Convocatoria 2025-26 - Candidatos Intercambio', icono: <FileText className="w-5 h-5" /> },
    { id: 2, titulo: 'Convocatoria 2026-27 - Estudiantes Subsidiados', icono: <FileText className="w-5 h-5" /> },
    { id: 3, titulo: 'Formato Presentación Outbound Distrito 4281', icono: <Download className="w-5 h-5" /> },
    { id: 4, titulo: 'Presentación del Programa de Intercambios de Jóvenes', icono: <FileText className="w-5 h-5" /> },
    { id: 5, titulo: 'Convocatoria para Presentar Candidatos de Intercambio', icono: <FileText className="w-5 h-5" /> },
    { id: 6, titulo: 'Reglamento Distrital de Intercambio de Jóvenes de Rotary', icono: <FileText className="w-5 h-5" /> },
  ];

  const documentos = sections['documents']?.items || defaultDocumentos;
  const ventajas = sections['ventajas']?.items || [
    'Adquirir destrezas de liderazgo que les servirán toda la vida',
    'Aprender un nuevo idioma y explorar otra cultura',
    'Forjar amistades duraderas con jóvenes del mundo entero',
    'Convertirse en ciudadanos del mundo'
  ];

  const costos = sections['costos']?.items || [
    'Pasaje aéreo de ida y vuelta',
    'Seguro de viajes',
    'Tramitación de documentos (pasaporte y visados)',
    'Dinero para gastos personales, excursiones, paseos'
  ];

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* YEP Hero Slider */}
      <YEPHero />

      {/* Title Section Container */}
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
          <h1 className="text-white font-bold" style={{ fontSize: '35px' }}>
            {getC('hero', 'title', "Intercambio de Jóvenes de Rotary")}
          </h1>
          <p className="text-white/80 mt-2 italic text-lg opacity-90">
            {getC('hero', 'description', `El Programa de Intercambio de Jóvenes del club ${club.name} hace parte de una red global con 22 países aliados.`)}
          </p>
        </div>
      </section>

      {/* 3. Experiencia Section (Grid asimétrico con cards flotantes) */}
      <section className="py-20 md:py-32 bg-gray-50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Texto y Listas */}
            <div className="lg:col-span-5 lg:pr-8 z-10">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rotary-blue/10 text-rotary-blue font-semibold text-sm mb-6">
                <Globe className="w-4 h-4" />
                <span>Intercambio Internacional</span>
              </div>
              <h2 className="text-4xl lg:text-5xl font-extrabold text-rotary-navy mb-6 leading-tight">
                {getC('experience', 'title', "¿Te interesa vivir una experiencia como estudiante de intercambio?")}
              </h2>
              <p className="text-gray-600 text-lg leading-relaxed mb-8">
                {getC('experience', 'p1', "Como participante del Programa de Intercambio de Jóvenes de Rotary, puedes vivir hasta un año en otro país, compartir con familias anfitrionas y asistir a un colegio local.")}
              </p>
              
              <ul className="space-y-5 mb-8">
                <li className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mt-1">
                    <CheckCircle className="w-5 h-5 text-rotary-blue" />
                  </div>
                  <div>
                    <h4 className="text-gray-900 font-bold text-lg">{getC('experience', 'highlight', "¡Oportunidad que transforma vidas!")}</h4>
                    <p className="text-gray-600 mt-1">Conecta con nuevas culturas y expande tus horizontes.</p>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mt-1">
                    <MapPin className="w-5 h-5 text-rotary-blue" />
                  </div>
                  <div>
                    <h4 className="text-gray-900 font-bold text-lg">Descubre el Mundo</h4>
                    <p className="text-gray-600 mt-1">
                      {getC('experience', 'p2', "En cualquier de ellos descubrirás nuevas formas de vida, aprenderás sobre ti mismo y tal vez incluso un nuevo idioma.")}
                    </p>
                  </div>
                </li>
              </ul>
            </div>
            
            {/* Imagen Asimétrica */}
            <div className="lg:col-span-7 relative">
              <div className="absolute -inset-4 bg-gradient-to-tr from-rotary-blue/20 to-transparent rounded-[3rem] transform rotate-3 scale-105 z-0" />
              <div className="absolute -inset-4 bg-gradient-to-bl from-rotary-gold/20 to-transparent rounded-[3rem] transform -rotate-3 scale-105 z-0" />
              <img
                src={getC('experience', 'image', "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=800&h=600&fit=crop")}
                alt="Jóvenes en intercambio"
                className="relative z-10 rounded-[2rem] shadow-2xl w-full h-[400px] md:h-[550px] object-cover ring-1 ring-black/5"
                loading="lazy"
              />
              {/* Floating Badge */}
              <div className="absolute -bottom-8 -left-8 md:-bottom-12 md:-left-12 z-20 bg-white p-6 rounded-2xl shadow-xl border border-gray-100 hidden md:block animate-bounce-slow">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-rotary-gold/20 rounded-full flex items-center justify-center">
                    <Users className="w-6 h-6 text-rotary-gold" />
                  </div>
                  <div>
                    <div className="text-2xl font-black text-gray-900">22+</div>
                    <div className="text-gray-500 font-medium text-sm">Países Aliados</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Documentos Section (Grid de Interactive Cards) */}
      <section className="py-20 md:py-32 bg-white relative">
        <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-gray-50 to-transparent" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-extrabold text-rotary-navy mb-6">
              {getC('documents', 'title', "¿Listo para comenzar tu viaje?")}
            </h2>
            <p className="text-xl text-gray-600">
              {getC('documents', 'description', "Descarga aquí todos los formularios y formatos necesarios para postularte.")}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documentos.map((doc: any, i: number) => (
              <a
                key={i}
                href={doc.url || "#"}
                className="group relative flex flex-col p-8 bg-white rounded-2xl shadow-sm hover:shadow-2xl transition-all duration-300 border border-gray-100 hover:border-rotary-blue overflow-hidden transform hover:-translate-y-1"
              >
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <FileText className="w-24 h-24 text-rotary-blue" />
                </div>
                <div className="w-14 h-14 bg-blue-50 text-rotary-blue rounded-xl flex items-center justify-center mb-6 group-hover:bg-rotary-blue group-hover:text-white transition-colors duration-300 shadow-inner">
                  {doc.icono || <DownloadCloud className="w-7 h-7" />}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-rotary-blue transition-colors">
                  {doc.titulo}
                </h3>
                <p className="text-gray-500 text-sm mb-8 flex-grow">
                  Obtén el formato oficial requerido para completar tu expediente de aplicación al intercambio YEP.
                </p>
                <div className="flex items-center text-rotary-blue font-semibold text-sm uppercase tracking-wide">
                  Descargar Archivo
                  <ChevronRight className="w-5 h-5 ml-1 group-hover:translate-x-2 transition-transform" />
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Banner Section (Full-Width Parallax con Overlay oscuro) */}
      <section className="relative py-32 md:py-48 bg-rotary-navy overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={getC('banner', 'image', "https://images.unsplash.com/photo-1552664730-d307ca884978?w=1600&h=800&fit=crop")}
            alt="Conectando"
            className="w-full h-full object-cover object-center scale-105"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-rotary-navy/95 via-rotary-navy/80 to-rotary-navy/60 backdrop-blur-[2px]" />
        </div>
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-white leading-tight drop-shadow-lg">
            {getC('banner', 'text', "¡Atrévete a cruzar fronteras, descubrir culturas y transformar tu mundo!")}
          </h2>
          <div className="mt-10">
            <a href="/unete" className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold rounded-full text-rotary-navy bg-rotary-gold hover:bg-yellow-400 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
              Inicia tu Postulación
            </a>
          </div>
        </div>
      </section>

      {/* 6. Ventajas y Costos (Split Cards Comparisons) */}
      <section className="py-20 md:py-32 bg-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-extrabold text-rotary-navy">Todo lo que necesitas saber</h2>
            <p className="mt-4 text-gray-600 text-lg">Resumen de los beneficios y los requerimientos económicos del programa de Intercambio de Jóvenes.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
            {/* Split Card: Ventajas */}
            <div className="bg-white rounded-3xl p-8 md:p-12 shadow-xl border-t-8 border-rotary-blue relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <Users className="w-32 h-32 text-rotary-blue" />
              </div>
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-8 shadow-inner">
                <Users className="w-8 h-8 text-rotary-blue" />
              </div>
              <h3 className="text-3xl font-black text-rotary-navy mb-8">
                ¿Qué ventajas ofrece?
              </h3>
              <ul className="space-y-4 relative z-10">
                {ventajas.map((ventaja: string, index: number) => (
                  <li key={index} className="flex items-start gap-4">
                    <CheckCircle className="w-6 h-6 text-rotary-blue flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700 text-lg">{ventaja}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Split Card: Costos */}
            <div className="bg-white rounded-3xl p-8 md:p-12 shadow-xl border-t-8 border-rotary-gold relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                <DollarSign className="w-32 h-32 text-rotary-gold" />
              </div>
              <div className="w-16 h-16 bg-yellow-50 rounded-2xl flex items-center justify-center mb-8 shadow-inner">
                <DollarSign className="w-8 h-8 text-rotary-gold" />
              </div>
              <h3 className="text-3xl font-black text-rotary-navy mb-8">
                ¿Cuál es el costo?
              </h3>
              <ul className="space-y-4 relative z-10">
                {costos.map((costo: string, index: number) => (
                  <li key={index} className="flex items-start gap-4">
                    <CheckCircle className="w-6 h-6 text-rotary-gold flex-shrink-0 mt-0.5" />
                    <span className="text-gray-700 text-lg">{costo}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default IntercambioJovenes;
