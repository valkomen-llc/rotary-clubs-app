import { useState } from 'react';
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Send,
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  Youtube,
  CheckCircle2,
  MessageCircle,
  User,
  AtSign,
  FileText
} from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';

const informacionContacto = [
  {
    icono: MapPin,
    titulo: 'Dirección',
    contenido: 'Carrera 7 # 71-21, Torre B Oficina 801',
    subtitulo: 'Bogotá, Colombia'
  },
  {
    icono: Phone,
    titulo: 'Teléfono',
    contenido: '+57 (1) 703 7838',
    subtitulo: 'Lunes a Viernes, 8am - 5pm'
  },
  {
    icono: Mail,
    titulo: 'Email',
    contenido: 'info@rotaryorigen.org',
    subtitulo: 'contacto@rotaryorigen.org'
  },
  {
    icono: Clock,
    titulo: 'Horario de Atención',
    contenido: 'Lunes a Viernes: 8:00 - 17:00',
    subtitulo: 'Sábados: 9:00 - 12:00'
  }
];

const redesSociales = [
  { nombre: 'Facebook', icono: Facebook, url: '#', color: 'bg-blue-600' },
  { nombre: 'Instagram', icono: Instagram, url: '#', color: 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500' },
  { nombre: 'Twitter', icono: Twitter, url: '#', color: 'bg-sky-500' },
  { nombre: 'LinkedIn', icono: Linkedin, url: '#', color: 'bg-blue-700' },
  { nombre: 'YouTube', icono: Youtube, url: '#', color: 'bg-red-600' }
];

const asuntos = [
  'Información general',
  'Quiero ser socio',
  'Donaciones',
  'Proyectos',
  'Prensa y medios',
  'Otro'
];

const Contacto = () => {
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    asunto: '',
    mensaje: ''
  });
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);

    // Simulación de envío
    await new Promise(resolve => setTimeout(resolve, 1500));

    setEnviando(false);
    setEnviado(true);
    setFormData({
      nombre: '',
      email: '',
      telefono: '',
      asunto: '',
      mensaje: ''
    });

    // Resetear mensaje de éxito después de 5 segundos
    setTimeout(() => setEnviado(false), 5000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <section
        className="relative overflow-hidden"
        style={{
          backgroundColor: '#263b4c',
          backgroundImage: "url('/geo-darkblue.png')",
          backgroundPosition: '50% 0',
          backgroundRepeat: 'repeat',
          backgroundSize: '71px 85px'
        }}
      >
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-block bg-rotary-gold text-white text-sm font-semibold px-4 py-1 rounded-full mb-6">
              Contáctanos
            </span>
            <h1 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Estamos Aquí para{' '}
              <span className="text-rotary-gold">Ayudarte</span>
            </h1>
            <p className="text-white/80 text-lg md:text-xl">
              ¿Tienes preguntas sobre nuestros proyectos, quieres ser socio o hacer una donación?
              Nos encantaría escucharte.
            </p>
          </div>
        </div>
      </section>

      {/* Información de Contacto */}
      <section className="py-12 md:py-16 bg-rotary-concrete">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {informacionContacto.map((item, index) => {
              const Icono = item.icono;
              return (
                <div key={index} className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow text-center">
                  <div className="w-14 h-14 bg-rotary-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Icono className="w-7 h-7 text-rotary-blue" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">{item.titulo}</h3>
                  <p className="text-gray-700">{item.contenido}</p>
                  <p className="text-gray-500 text-sm mt-1">{item.subtitulo}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Formulario y Mapa */}
      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Formulario */}
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                Envíanos un Mensaje
              </h2>
              <p className="text-gray-600 mb-8">
                Completa el formulario y te responderemos lo antes posible.
              </p>

              {enviado && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-green-800">¡Mensaje enviado!</h4>
                    <p className="text-green-700 text-sm">
                      Gracias por contactarnos. Te responderemos en un plazo de 24-48 horas.
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="nombre" className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre completo *
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        id="nombre"
                        name="nombre"
                        required
                        value={formData.nombre}
                        onChange={handleChange}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                        placeholder="Tu nombre"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      Correo electrónico *
                    </label>
                    <div className="relative">
                      <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                        placeholder="tu@email.com"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="telefono" className="block text-sm font-medium text-gray-700 mb-2">
                      Teléfono
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="tel"
                        id="telefono"
                        name="telefono"
                        value={formData.telefono}
                        onChange={handleChange}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                        placeholder="+57 (1) 234 5678"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="asunto" className="block text-sm font-medium text-gray-700 mb-2">
                      Asunto *
                    </label>
                    <div className="relative">
                      <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <select
                        id="asunto"
                        name="asunto"
                        required
                        value={formData.asunto}
                        onChange={handleChange}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all appearance-none bg-white"
                      >
                        <option value="">Selecciona un asunto</option>
                        {asuntos.map((asunto, index) => (
                          <option key={index} value={asunto}>{asunto}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="mensaje" className="block text-sm font-medium text-gray-700 mb-2">
                    Mensaje *
                  </label>
                  <div className="relative">
                    <MessageCircle className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                    <textarea
                      id="mensaje"
                      name="mensaje"
                      required
                      rows={5}
                      value={formData.mensaje}
                      onChange={handleChange}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all resize-none"
                      placeholder="Escribe tu mensaje aquí..."
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full bg-rotary-blue text-white py-4 rounded-full font-semibold hover:bg-rotary-dark-blue transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {enviando ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Enviar Mensaje
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Mapa e Información Adicional */}
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                Nuestra Ubicación
              </h2>
              <p className="text-gray-600 mb-8">
                Visítanos en nuestras oficinas. Estaremos encantados de recibirte.
              </p>

              {/* Mapa Placeholder */}
              <div className="bg-gray-100 rounded-xl overflow-hidden mb-8 aspect-[4/3]">
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-rotary-blue/5 to-rotary-gold/5">
                  <div className="text-center p-8">
                    <div className="w-20 h-20 bg-rotary-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MapPin className="w-10 h-10 text-rotary-blue" />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-2">Rotary Club</h3>
                    <p className="text-gray-600 text-sm">
                      Carrera 7 # 71-21, Torre B Oficina 801<br />
                      Bogotá, Colombia
                    </p>
                    <a
                      href="https://maps.google.com/?q=Bogotá+Colombia"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-rotary-blue font-medium mt-4 hover:underline"
                    >
                      Ver en Google Maps
                    </a>
                  </div>
                </div>
              </div>

              {/* Redes Sociales */}
              <div>
                <h3 className="font-bold text-gray-900 mb-4">Síguenos en Redes Sociales</h3>
                <div className="flex gap-3">
                  {redesSociales.map((red, index) => {
                    const Icono = red.icono;
                    return (
                      <a
                        key={index}
                        href={red.url}
                        className={`w-12 h-12 ${red.color} rounded-full flex items-center justify-center text-white hover:opacity-90 transition-opacity`}
                        title={red.nombre}
                      >
                        <Icono className="w-5 h-5" />
                      </a>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Preguntas Frecuentes */}
      <section className="py-16 md:py-24 bg-rotary-concrete">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              Preguntas Frecuentes
            </h2>
            <p className="text-gray-600">
              Encuentra respuestas a las preguntas más comunes.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                pregunta: '¿Cómo puedo ser socio del Rotary Club?',
                respuesta: 'Para ser socio, debes ser invitado por un socio actual o solicitar una entrevista con nuestro comité de membresía. Contáctanos para más información sobre el proceso.'
              },
              {
                pregunta: '¿Puedo hacer donaciones sin ser socio?',
                respuesta: '¡Por supuesto! Aceptamos donaciones de personas y empresas. Puedes donar a proyectos específicos o hacer aportes generales a través de nuestra sección de Proyectos.'
              },
              {
                pregunta: '¿Cómo puedo solicitar apoyo para un proyecto comunitario?',
                respuesta: 'Envíanos un correo a info@rotaryorigen.org describiendo tu proyecto, la comunidad beneficiaria y el presupuesto estimado. Nuestro comité de proyectos lo evaluará.'
              },
              {
                pregunta: '¿El club tiene actividades presenciales o virtuales?',
                respuesta: 'Como club, nuestras reuniones son principalmente virtuales, pero también organizamos eventos presenciales para proyectos y actividades comunitarias.'
              }
            ].map((faq, index) => (
              <div key={index} className="bg-white rounded-xl p-6 shadow-sm">
                <h3 className="font-bold text-gray-900 mb-2">{faq.pregunta}</h3>
                <p className="text-gray-600">{faq.respuesta}</p>
              </div>
            ))}
          </div>
        </div>
      </section>


      <Footer />
    </div>
  );
};

export default Contacto;
