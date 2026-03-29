import {
  FileText,
  Download,
  Users,
  DollarSign,
  ChevronRight,
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

      {/* Experiencia Section */}
      <section className="py-16 md:py-24 bg-rotary-concrete">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
                {getC('experience', 'title', "¿Te interesa vivir una experiencia como estudiante de intercambio?")}
              </h2>
              <div className="space-y-4 text-gray-700 leading-relaxed">
                <p>
                  {getC('experience', 'p1', "Como participante del Programa de Intercambio de Jóvenes de Rotary, puedes vivir hasta un año en otro país, compartir con familias anfitrionas y asistir a un colegio local.")}
                </p>
                <p className="font-semibold text-rotary-blue">
                  {getC('experience', 'highlight', "¡Es una oportunidad que transforma vidas!")}
                </p>
                <p>
                  {getC('experience', 'p2', "En cualquier de ellos descubrirás nuevas formas de vida, aprenderás sobre ti mismo y tal vez incluso un nuevo idioma.")}
                </p>
              </div>
            </div>
            <div className="relative">
              <img
                src={getC('experience', 'image', "https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=600&h=500&fit=crop")}
                alt="Jóvenes en intercambio"
                className="rounded-2xl shadow-xl w-full h-auto object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Documentos Section */}
      <section className="py-16 md:py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8">
                {getC('documents', 'title', "¿Listo para comenzar tu viaje?")}
              </h2>
              <p className="text-gray-700 mb-8 leading-relaxed">
                {getC('documents', 'description', "Descarga aquí todos los formularios y formatos necesarios para postularte.")}
              </p>

              <div className="space-y-3">
                {documentos.map((doc: any, i: number) => (
                  <a
                    key={i}
                    href={doc.url || "#"}
                    className="flex items-center gap-3 p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-100 group"
                  >
                    <span className="text-rotary-blue group-hover:text-rotary-gold transition-colors">
                      {doc.icono || <FileText className="w-5 h-5" />}
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
                src={getC('documents', 'image', "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?w=600&h=700&fit=crop")}
                alt="Estudiantes"
                className="rounded-2xl shadow-xl w-full h-auto object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Banner Section */}
      <section className="py-16 md:py-24 bg-rotary-navy">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6 leading-tight">
                {getC('banner', 'text', "¡Atrévete a cruzar fronteras, descubrir culturas y transformar tu mundo!")}
              </h2>
            </div>
            <div className="relative">
              <img
                src={getC('banner', 'image', "https://images.unsplash.com/photo-1552664730-d307ca884978?w=600&h=500&fit=crop")}
                alt="Conectando"
                className="rounded-2xl shadow-xl w-full h-auto object-cover"
                loading="lazy"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Ventajas y Costos */}
      <section className="py-16 md:py-24 bg-rotary-concrete">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-12">
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="w-6 h-6 text-rotary-blue" />
              ¿Qué ventajas ofrece?
            </h3>
            <ul className="space-y-2">
              {ventajas.map((ventaja: string, index: number) => (
                <li key={index} className="flex items-start gap-2 text-gray-700">
                  <span className="text-rotary-blue font-bold">–</span>
                  <span>{ventaja}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mb-12">
            <h3 className="text-xl md:text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-rotary-blue" />
              ¿Cuál es el costo?
            </h3>
            <ul className="space-y-2">
              {costos.map((costo: string, index: number) => (
                <li key={index} className="flex items-start gap-2 text-gray-700">
                  <span className="text-rotary-blue font-bold">–</span>
                  <span>{costo}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default IntercambioJovenes;
