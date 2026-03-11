import { useState, useEffect } from 'react';
import {
  MapPin,
  Phone,
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  Youtube,
  CheckCircle2,
  MessageCircle,
  User,
  AtSign,
  FileText,
  Briefcase,
  Clock,
} from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';
import { useSearchParams } from 'react-router-dom';

const redesSocialesIconMap: Record<string, React.ElementType> = {
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  Youtube
};

const Contacto = () => {
  const { club } = useClub();
  const { sections } = useCMSContent('contacto', club.id);
  const [searchParams] = useSearchParams();

  const [formData, setFormData] = useState({
    nombre: '',
    apellido: '',
    email: '',
    telefono: '',
    asunto: '',
    mensaje: '',
    // Extended fields
    profesion: '',
    empleador: '',
    rangoEdad: '',
    genero: '',
    tipoTelefono: '',
    paisPrefijo: '',
    horaContacto: '',
    metodoContacto: '',
  });
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // Pre-select subject from URL param (?asunto=Quiero+ser+socio)
  useEffect(() => {
    const asuntoParam = searchParams.get('asunto');
    if (asuntoParam) {
      setFormData(prev => ({ ...prev, asunto: asuntoParam }));
    }
  }, [searchParams]);

  // Determine if extended fields should show
  const showExtended = formData.asunto === 'Quiero ser socio' || formData.asunto === 'Donaciones';

  const getC = (section: string, field: string, fallback: string) => {
    return sections[section]?.[field] || fallback;
  }

  const defaultInfo = [
    {
      icono: MapPin,
      titulo: 'Dirección',
      contenido: club.contact?.address || 'Bogotá, Colombia',
      subtitulo: club.city || ''
    },
    {
      icono: Phone,
      titulo: 'Teléfono',
      contenido: club.contact?.phone || '+57',
      subtitulo: 'Lunes a Viernes'
    }
  ];

  const infoContacto = sections['info-list']?.items?.map((item: any) => ({
    ...item,
    icono: MapPin // Default icon since icon strings need mapping
  })) || defaultInfo;

  const defaultRedes = [
    { nombre: 'Facebook', icono: Facebook, url: '#', color: 'bg-blue-600' },
    { nombre: 'Instagram', icono: Instagram, url: '#', color: 'bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500' }
  ];

  const redes = sections['social-list']?.items?.map((item: any) => ({
    ...item,
    icono: redesSocialesIconMap[item.red] || Facebook
  })) || defaultRedes;

  const faqs = sections['faq-list']?.items || [
    {
      pregunta: '¿Cómo puedo ser socio?',
      respuesta: 'Contáctanos para más información sobre el proceso.'
    }
  ];

  const asuntos = sections['asuntos']?.items?.map((i: any) => i.value) || [
    'Información general',
    'Quiero ser socio',
    'Donaciones'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    try {
      const API = import.meta.env.VITE_API_URL || '/api';
      const fullName = showExtended
        ? `${formData.nombre} ${formData.apellido}`.trim()
        : formData.nombre;

      const metadata = showExtended ? {
        apellido: formData.apellido,
        profesion: formData.profesion,
        empleador: formData.empleador,
        rangoEdad: formData.rangoEdad,
        genero: formData.genero,
        tipoTelefono: formData.tipoTelefono,
        paisPrefijo: formData.paisPrefijo,
        horaContacto: formData.horaContacto,
        metodoContacto: formData.metodoContacto,
      } : {};

      const res = await fetch(`${API}/leads/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullName,
          email: formData.email,
          phone: formData.telefono || null,
          subject: formData.asunto,
          message: formData.mensaje,
          clubId: club.id,
          source: showExtended ? 'involucrate_form' : 'contact_form',
          metadata,
        }),
      });
      if (res.ok) {
        setEnviado(true);
        setFormData({
          nombre: '', apellido: '', email: '', telefono: '', asunto: '', mensaje: '',
          profesion: '', empleador: '', rangoEdad: '', genero: '',
          tipoTelefono: '', paisPrefijo: '', horaContacto: '', metodoContacto: '',
        });
        setTimeout(() => setEnviado(false), 5000);
      }
    } catch (err) {
      console.error('Error submitting form:', err);
    } finally {
      setEnviando(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section */}
      <section
        className="relative overflow-hidden"
        style={{
          backgroundColor: '#0c3c7c',
          backgroundImage: "url('/geo-darkblue.png')",
          backgroundPosition: '50% 0',
          backgroundRepeat: 'repeat',
          backgroundSize: '71px 85px'
        }}
      >
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          <div className="text-center max-w-3xl mx-auto">
            <span className="inline-block bg-rotary-gold text-white text-sm font-semibold px-4 py-1 rounded-full mb-6">
              {getC('header', 'badge', "Contáctanos")}
            </span>
            <h1 className="text-3xl md:text-5xl font-bold text-white mb-6">
              {getC('header', 'title', "Estamos Aquí para")}{' '}
              <span className="text-rotary-gold">{getC('header', 'highlight', "Ayudarte")}</span>
            </h1>
            <p className="text-white/80 text-lg md:text-xl">
              {getC('header', 'description', "¿Tienes preguntas sobre nuestros proyectos o quieres ser socio?")}
            </p>
          </div>
        </div>
      </section>

      {/* Información de Contacto */}
      <section className="py-12 md:py-16 bg-rotary-concrete">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {infoContacto.map((item: any, index: number) => {
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
                {getC('form', 'title', "Envíanos un Mensaje")}
              </h2>
              <p className="text-gray-600 mb-8">
                {getC('form', 'description', "Completa el formulario y te responderemos lo antes posible.")}
              </p>

              {enviado && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-green-800">¡Mensaje enviado!</h4>
                    <p className="text-green-700 text-sm">
                      Gracias por contactarnos. Te responderemos pronto.
                    </p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Asunto FIRST — controls which fields appear */}
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
                      {asuntos.map((asunto: string, index: number) => (
                        <option key={index} value={asunto}>{asunto}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {showExtended && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-2">
                    <p className="text-sm text-blue-800 font-medium">
                      📋 Completa la información adicional para que podamos conocerte mejor y brindarte una atención personalizada.
                    </p>
                  </div>
                )}

                {/* ─── SECCIÓN: Acerca de mí (extended) ─── */}
                {showExtended ? (
                  <>
                    <h3 className="text-lg font-bold text-gray-800 border-b border-gray-200 pb-2">Acerca de mí</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="nombre" className="block text-sm font-medium text-gray-700 mb-2">
                          Nombre *
                        </label>
                        <input type="text" id="nombre" name="nombre" required value={formData.nombre} onChange={handleChange}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                          placeholder="Tu nombre" />
                      </div>
                      <div>
                        <label htmlFor="apellido" className="block text-sm font-medium text-gray-700 mb-2">
                          Apellido *
                        </label>
                        <input type="text" id="apellido" name="apellido" required value={formData.apellido} onChange={handleChange}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                          placeholder="Tu apellido" />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                        Correo electrónico *
                      </label>
                      <div className="relative">
                        <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input type="email" id="email" name="email" required value={formData.email} onChange={handleChange}
                          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                          placeholder="tu@email.com" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="profesion" className="block text-sm font-medium text-gray-700 mb-2">
                          Profesión *
                        </label>
                        <div className="relative">
                          <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <input type="text" id="profesion" name="profesion" required value={formData.profesion} onChange={handleChange}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                            placeholder="Tu profesión" />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="empleador" className="block text-sm font-medium text-gray-700 mb-2">
                          Empleador
                        </label>
                        <input type="text" id="empleador" name="empleador" value={formData.empleador} onChange={handleChange}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                          placeholder="Empresa u organización" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="rangoEdad" className="block text-sm font-medium text-gray-700 mb-2">
                          Rango de edad *
                        </label>
                        <select id="rangoEdad" name="rangoEdad" required value={formData.rangoEdad} onChange={handleChange}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all appearance-none bg-white">
                          <option value="">- Seleccione -</option>
                          <option value="18-25">18 - 25 años</option>
                          <option value="26-35">26 - 35 años</option>
                          <option value="36-45">36 - 45 años</option>
                          <option value="46-55">46 - 55 años</option>
                          <option value="56-65">56 - 65 años</option>
                          <option value="65+">65+ años</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="genero" className="block text-sm font-medium text-gray-700 mb-2">
                          Género
                        </label>
                        <select id="genero" name="genero" value={formData.genero} onChange={handleChange}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all appearance-none bg-white">
                          <option value="">- Seleccione -</option>
                          <option value="masculino">Masculino</option>
                          <option value="femenino">Femenino</option>
                          <option value="otro">Otro</option>
                          <option value="prefiero-no-decir">Prefiero no decir</option>
                        </select>
                      </div>
                    </div>

                    {/* Teléfono preferido */}
                    <h3 className="text-lg font-bold text-gray-800 border-b border-gray-200 pb-2 mt-4">Teléfono preferido</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="telefono" className="block text-sm font-medium text-gray-700 mb-2">
                          Teléfono
                        </label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <input type="tel" id="telefono" name="telefono" value={formData.telefono} onChange={handleChange}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                            placeholder="+57 300 123 4567" />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="tipoTelefono" className="block text-sm font-medium text-gray-700 mb-2">
                          Tipo
                        </label>
                        <select id="tipoTelefono" name="tipoTelefono" value={formData.tipoTelefono} onChange={handleChange}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all appearance-none bg-white">
                          <option value="">- Seleccione -</option>
                          <option value="celular">Celular</option>
                          <option value="fijo">Fijo</option>
                          <option value="trabajo">Trabajo</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="paisPrefijo" className="block text-sm font-medium text-gray-700 mb-2">
                          País (prefijo)
                        </label>
                        <select id="paisPrefijo" name="paisPrefijo" value={formData.paisPrefijo} onChange={handleChange}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all appearance-none bg-white">
                          <option value="">- Seleccione -</option>
                          <option value="+57">🇨🇴 Colombia (+57)</option>
                          <option value="+1">🇺🇸 Estados Unidos (+1)</option>
                          <option value="+52">🇲🇽 México (+52)</option>
                          <option value="+34">🇪🇸 España (+34)</option>
                          <option value="+54">🇦🇷 Argentina (+54)</option>
                          <option value="+56">🇨🇱 Chile (+56)</option>
                          <option value="+51">🇵🇪 Perú (+51)</option>
                          <option value="+593">🇪🇨 Ecuador (+593)</option>
                          <option value="+58">🇻🇪 Venezuela (+58)</option>
                          <option value="otro">Otro</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="horaContacto" className="block text-sm font-medium text-gray-700 mb-2">
                          Hora en que prefiero que me llamen
                        </label>
                        <div className="relative">
                          <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <input type="text" id="horaContacto" name="horaContacto" value={formData.horaContacto} onChange={handleChange}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                            placeholder="Ej: 9:00 AM - 12:00 PM" />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="metodoContacto" className="block text-sm font-medium text-gray-700 mb-2">
                        Método de contacto preferido
                      </label>
                      <select id="metodoContacto" name="metodoContacto" value={formData.metodoContacto} onChange={handleChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all appearance-none bg-white">
                        <option value="">- Seleccione -</option>
                        <option value="email">Correo electrónico</option>
                        <option value="telefono">Teléfono</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="cualquiera">Cualquiera</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    {/* ─── Standard form fields ─── */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                      <div>
                        <label htmlFor="nombre" className="block text-sm font-medium text-gray-700 mb-2">
                          Nombre completo *
                        </label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <input type="text" id="nombre" name="nombre" required value={formData.nombre} onChange={handleChange}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                            placeholder="Tu nombre" />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                          Correo electrónico *
                        </label>
                        <div className="relative">
                          <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                          <input type="email" id="email" name="email" required value={formData.email} onChange={handleChange}
                            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                            placeholder="tu@email.com" />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="telefono" className="block text-sm font-medium text-gray-700 mb-2">
                        Teléfono
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                        <input type="tel" id="telefono" name="telefono" value={formData.telefono} onChange={handleChange}
                          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all"
                          placeholder="+57" />
                      </div>
                    </div>
                  </>
                )}

                {/* Mensaje — always visible */}
                <div>
                  <label htmlFor="mensaje" className="block text-sm font-medium text-gray-700 mb-2">
                    Mensaje {!showExtended && '*'}
                  </label>
                  <div className="relative">
                    <MessageCircle className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                    <textarea
                      id="mensaje"
                      name="mensaje"
                      required={!showExtended}
                      rows={showExtended ? 3 : 5}
                      value={formData.mensaje}
                      onChange={handleChange}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all resize-none"
                      placeholder={showExtended ? "¿Algo que quieras contarnos? (opcional)" : "Escribe tu mensaje aquí..."}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={enviando}
                  className="w-full bg-rotary-blue text-white py-4 rounded-full font-semibold hover:bg-rotary-dark-blue transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {enviando ? "Enviando..." : "Enviar Mensaje"}
                </button>
              </form>
            </div>

            {/* Mapa e Información Adicional */}
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                {getC('location', 'title', "Nuestra Ubicación")}
              </h2>
              <p className="text-gray-600 mb-8">
                {getC('location', 'description', "Visítanos en nuestras oficinas.")}
              </p>

              <div className="bg-gray-100 rounded-xl overflow-hidden mb-8 aspect-[4/3]">
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-rotary-blue/5 to-rotary-gold/5">
                  <div className="text-center p-8">
                    <div className="w-20 h-20 bg-rotary-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <MapPin className="w-10 h-10 text-rotary-blue" />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-2">{club.name}</h3>
                    <p className="text-gray-600 text-sm">
                      {club.contact?.address}<br />
                      {club.city}
                    </p>
                    <a
                      href={`https://maps.google.com/?q=${club.contact?.address}+${club.city}`}
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
                  {redes.map((red: any, index: number) => {
                    const Icono = red.icono;
                    return (
                      <a
                        key={index}
                        href={red.url}
                        className={`w-12 h-12 ${red.color || 'bg-rotary-blue'} rounded-full flex items-center justify-center text-white hover:opacity-90 transition-opacity`}
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
            {faqs.map((faq: any, index: number) => (
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
