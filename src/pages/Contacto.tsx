import { useState, useEffect } from 'react';
import {
  MapPin,
  Phone,
  CheckCircle2,
  MessageCircle,
  User,
  AtSign,
  FileText,
  Briefcase,
  Clock,
  Mail,
  ChevronDown,
  Heart,
} from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useCMSContent } from '../hooks/useCMSContent';
import { useClub } from '../contexts/ClubContext';
import { useSearchParams } from 'react-router-dom';
import { useSEO } from '../hooks/useSEO';


const Contacto = () => {
  const { club } = useClub();
  const { sections } = useCMSContent('contacto', club.id);
  const [searchParams] = useSearchParams();

  useSEO({
    title: 'Contáctanos',
    description: `Comunícate con ${(club as any)?.name || 'nuestro club Rotary'}. Formulario de contacto, membresía y donaciones.`,
    path: '/contacto',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name: `Contacto — ${(club as any)?.name}`,
      url: `https://${(club as any)?.domain || 'clubplatform.org'}/#/contacto`,
    },
  });

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
    comoSupiste: '',
    porqueInvolucrar: '',
    comentarios: '',
  });
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [donationAmount, setDonationAmount] = useState('50');

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
    },
    {
      icono: Mail,
      titulo: 'Correo electrónico',
      contenido: club.contact?.email || 'info@rotary.org',
      subtitulo: 'Respuesta en 24-48 horas'
    },
    {
      icono: Clock,
      titulo: 'Horario de reuniones',
      contenido: (club.contact as any)?.schedule || 'Consultar horario',
      subtitulo: (club.contact as any)?.meetingPlace || 'Día y lugar por confirmar'
    }
  ];

  const infoContacto = sections['info-list']?.items?.map((item: any) => ({
    ...item,
    icono: MapPin // Default icon since icon strings need mapping
  })) || defaultInfo;


  const defaultFaqs = [
    {
      pregunta: '¿Cómo puedo ser socio de Rotary?',
      respuesta: 'La afiliación a los clubes rotarios es por invitación. Puedes completar nuestro formulario de interés seleccionando el asunto "Quiero ser socio" y nos pondremos en contacto contigo para guiarte en el proceso.'
    },
    {
      pregunta: '¿Qué es Rotary International?',
      respuesta: 'Rotary International es una organización global de líderes comunitarios y profesionales que se dedican a abordar los problemas más apremiantes del mundo. Con más de 1,4 millones de socios en más de 46.000 clubes, Rotary conecta a personas que comparten la pasión por el servicio.'
    },
    {
      pregunta: '¿Cuáles son las áreas de interés de Rotary?',
      respuesta: 'Rotary enfoca sus esfuerzos en siete áreas: promoción de la paz, lucha contra las enfermedades, suministro de agua potable, salud materno-infantil, educación y alfabetización, desarrollo de las economías locales y protección del medio ambiente.'
    },
    {
      pregunta: '¿Cuánto cuesta ser socio?',
      respuesta: 'Las cuotas varían según el club. Generalmente incluyen una cuota de admisión y cuotas periódicas que cubren gastos operativos y contribuciones a proyectos. Contáctanos para conocer los detalles específicos de nuestro club.'
    },
    {
      pregunta: '¿Puedo hacer una donación sin ser socio?',
      respuesta: 'Sí, cualquier persona puede contribuir a La Fundación Rotaria o a los proyectos de nuestro club. Las donaciones son deducibles de impuestos y el 100% se destina a proyectos humanitarios y educativos.'
    },
    {
      pregunta: '¿Qué beneficios tiene ser socio de Rotary?',
      respuesta: 'Como socio disfrutas de oportunidades de networking profesional, desarrollo de liderazgo, participación en proyectos de servicio locales e internacionales, acceso a becas y programas de intercambio, y la satisfacción de generar un cambio positivo en tu comunidad.'
    }
  ];

  const [liveFaqs, setLiveFaqs] = useState<any[]>([]);

  useEffect(() => {
    const API = import.meta.env.VITE_API_URL || '/api';
    fetch(`${API}/faqs?clubId=${club.id}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.faqs?.length) setLiveFaqs(data.faqs); })
      .catch(() => { });
  }, [club.id]);

  const faqs = liveFaqs.length > 0
    ? liveFaqs.map((f: any) => ({ pregunta: f.question, respuesta: f.answer }))
    : (sections['faq-list']?.items || defaultFaqs);

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
        comoSupiste: formData.comoSupiste,
        porqueInvolucrar: formData.porqueInvolucrar,
        comentarios: formData.comentarios,
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

        // ── Trigger Orchestrator Background Task ──
        fetch(`${API}/agents/orchestrate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clubId: club.id,
            type: 'new_contact_lead',
            payload: {
              name: fullName,
              subject: formData.asunto,
              message: formData.mensaje,
              contact_info: { email: formData.email, phone: formData.telefono },
              source: showExtended ? 'involucrate_form' : 'contact_form',
              metadata
            }
          })
        }).catch(err => console.error('[Orchestration] Dispatch failed:', err));

        setFormData({
          nombre: '', apellido: '', email: '', telefono: '', asunto: '', mensaje: '',
          profesion: '', empleador: '', rangoEdad: '', genero: '',
          tipoTelefono: '', paisPrefijo: '', horaContacto: '', metodoContacto: '',
          comoSupiste: '', porqueInvolucrar: '', comentarios: '',
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
            <h1 className="text-3xl md:text-5xl font-bold text-white mb-6">
              Contáctanos
            </h1>
            <p className="text-white/80 text-lg md:text-xl">
              Estamos Aquí para Ayudarte
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
                {formData.asunto === 'Quiero ser socio'
                  ? 'Solicitud de Membresía'
                  : formData.asunto === 'Donaciones'
                    ? 'Quiero Contribuir'
                    : 'Envíanos un Mensaje'}
              </h2>
              <p className="text-gray-600 mb-8">
                {formData.asunto === 'Quiero ser socio'
                  ? 'Completa tus datos y nos pondremos en contacto para guiarte en el proceso de afiliación.'
                  : formData.asunto === 'Donaciones'
                    ? 'Gracias por tu interés en apoyar nuestros proyectos. Déjanos tus datos para coordinar tu donación.'
                    : 'Completa el formulario y te responderemos lo antes posible.'}
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

                    {/* ¿Cómo supiste de Rotary? */}
                    <div>
                      <label htmlFor="comoSupiste" className="block text-sm font-medium text-gray-700 mb-2">
                        ¿Cómo supiste de Rotary?
                      </label>
                      <select id="comoSupiste" name="comoSupiste" value={formData.comoSupiste} onChange={handleChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all appearance-none bg-white">
                        <option value="">- Seleccione -</option>
                        <option value="amigo-familiar">Un amigo o familiar</option>
                        <option value="evento">Un evento de Rotary</option>
                        <option value="redes-sociales">Redes sociales</option>
                        <option value="internet">Búsqueda en internet</option>
                        <option value="prensa">Prensa o medios</option>
                        <option value="trabajo">En el trabajo</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>

                    {/* Motivación / Contribución */}
                    <div>
                      <label htmlFor="porqueInvolucrar" className="block text-sm font-medium text-gray-700 mb-2">
                        {formData.asunto === 'Donaciones'
                          ? '¿Cómo te gustaría contribuir?'
                          : '¿Por qué quieres involucrarte?'}
                      </label>
                      <textarea id="porqueInvolucrar" name="porqueInvolucrar" value={formData.porqueInvolucrar}
                        onChange={(e) => { if (e.target.value.length <= 250) handleChange(e); }}
                        rows={4}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all resize-none"
                        placeholder={formData.asunto === 'Donaciones'
                          ? 'Ej: Donación económica, en especie, patrocinio de evento...'
                          : 'Cuéntanos tus motivaciones...'} />
                      <p className="text-xs text-gray-400 mt-1">Quedan {250 - formData.porqueInvolucrar.length} caracteres</p>
                    </div>

                    {/* Comentarios adicionales */}
                    <div>
                      <label htmlFor="comentarios" className="block text-sm font-medium text-gray-700 mb-2">
                        Comentarios adicionales
                      </label>
                      <textarea id="comentarios" name="comentarios" value={formData.comentarios}
                        onChange={(e) => { if (e.target.value.length <= 250) handleChange(e); }}
                        rows={4}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rotary-blue focus:border-transparent outline-none transition-all resize-none"
                        placeholder="¿Algo más que quieras agregar?" />
                      <p className="text-xs text-gray-400 mt-1">Quedan {250 - formData.comentarios.length} caracteres</p>
                    </div>

                    {/* Política de Privacidad */}
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 text-sm text-gray-600 leading-relaxed">
                      <p>
                        Tu privacidad es importante para Rotary International y La Fundación Rotaria (en adelante, "Rotary") y los datos personales que compartas con Rotary solo se utilizarán para fines oficiales. Esto significa que los datos personales que proporciones se utilizarán principalmente para tu membresía potencial y activa (si se te invita a convertirte en socio) de un club rotario, lo cual incluye invitaciones para que participes en otras oportunidades de membresía, informes sobre datos relacionados a la membresía, procesamientos financieros, apoyo a La Fundación Rotaria, facilitación de planificación de eventos, comunicación de mensajes organizacionales clave y respuestas a cualquier inquietud que puedas tener. Los datos personales que proporciones se compartirán con funcionarios distritales y de club de Rotary, así como con sus delegados. Los datos personales recogidos en este formulario están sujetos a la{' '}
                        <a href="https://my.rotary.org/es/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-rotary-blue underline font-semibold hover:text-rotary-gold transition-colors">
                          Política de privacidad de Rotary
                        </a>.
                      </p>
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

                {/* Mensaje — only for standard form */}
                {!showExtended && (
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
                )}

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

              <div className="bg-gray-100 rounded-xl overflow-hidden mb-8 aspect-[4/3] relative">
                {club.contact?.address ? (
                  <iframe
                    title="Ubicación del club"
                    width="100%"
                    height="100%"
                    style={{ border: 0, position: 'absolute', top: 0, left: 0 }}
                    loading="lazy"
                    allowFullScreen
                    src={`https://maps.google.com/maps?q=${encodeURIComponent(`${club.contact?.address || ''} ${club.city || ''}`.trim())}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-rotary-blue/5 to-rotary-gold/5 absolute inset-0">
                    <div className="text-center p-8">
                      <div className="w-20 h-20 bg-rotary-blue/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <MapPin className="w-10 h-10 text-rotary-blue" />
                      </div>
                      <h3 className="font-bold text-gray-900 mb-2">{club.name}</h3>
                      <p className="text-gray-600 text-sm">Dirección no configurada</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Membership Steps — only when "Quiero ser socio" */}
              {formData.asunto === 'Quiero ser socio' && (
                <div className="mt-10">
                  <h3 className="text-xl font-bold text-gray-900 mb-8">Proceso para ser socio</h3>
                  <div className="space-y-0">
                    {[
                      {
                        step: 1,
                        title: 'Solicita unirte a un club Rotario',
                        description: 'Los clubes rotarios son la experiencia rotaria tradicional. Los clubes están compuestos por voluntarios dedicados que trabajan juntos para marcar la diferencia en su comunidad y en comunidades de todo el mundo.',
                        bgPos: '0 0',
                      },
                      {
                        step: 2,
                        title: 'La experiencia del candidato',
                        description: 'Dado que la experiencia es tan personal para el club al que te unes, la membresía es determinada por el club individual y cada uno tiene su propio proceso de ingreso. Algunos pueden llamar, algunos pueden enviar un mensaje, algunos pueden invitarte a participar en un proyecto de servicio o asistir a una reunión del club.',
                        bgPos: '0 -280px',
                      },
                      {
                        step: 3,
                        title: 'Invitación para unirte',
                        description: 'Esperamos que unirte a Rotary se convierta en una experiencia enriquecedora para toda la vida. Porque unirse a menudo conduce a amistades significativas, la decisión de invitar a una nueva persona no se toma a la ligera y a menudo involucra a todos los miembros del club.',
                        bgPos: '0 -420px',
                      },
                      {
                        step: 4,
                        title: '¡Eres miembro de un club Rotario!',
                        description: '¡Felicidades, eres parte de un legado de más de 100 años de poner el Servicio por Encima de Uno Mismo! Tienes un club lleno de nuevos amigos y asociados que te apoyarán durante tu primer año en Rotary y más allá.',
                        bgPos: '0 -560px',
                      },
                    ].map((item, idx, arr) => (
                      <div key={idx} className="flex gap-5">
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div
                            className="w-14 h-14 rounded-full bg-sky-100 border-4 border-white shadow-md overflow-hidden flex-shrink-0"
                            style={{
                              backgroundImage: `url('https://my-cms.rotary.org/sites/all/modules/custom/rotary_manage_membership/images/Progress-Tracker-Graphic.png')`,
                              backgroundSize: '56px auto',
                              backgroundPosition: item.bgPos,
                              backgroundRepeat: 'no-repeat',
                            }}
                          />
                          {idx < arr.length - 1 && (
                            <div className="w-0.5 flex-1 bg-gray-200 min-h-[30px]" />
                          )}
                        </div>
                        <div className="pb-8">
                          <span className="text-xs font-bold text-rotary-blue uppercase tracking-wide">
                            Paso {item.step}
                          </span>
                          <h4 className="text-base font-bold text-gray-900 mt-1 mb-1">{item.title}</h4>
                          <p className="text-gray-600 text-sm leading-relaxed">{item.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Donation Card — only when "Donaciones" */}
              {formData.asunto === 'Donaciones' && (
                <div className="mt-10">
                  <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-100">
                    <h3 className="text-xl font-bold text-gray-800 text-center mb-3">
                      Aporte voluntario al Club
                    </h3>
                    <p className="text-gray-600 text-sm text-center mb-8 leading-relaxed">
                      Tu contribución fortalece el impacto del club {club.name} y sostiene iniciativas de servicio que transforman vidas.
                    </p>

                    <label className="block text-sm font-semibold text-gray-700 mb-3">Selecciona el monto (USD)</label>
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      {['10', '25', '50', '100'].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setDonationAmount(amt)}
                          className={`py-3 rounded-lg font-bold transition-all border-2 text-sm ${donationAmount === amt
                              ? 'border-[#9D2235] bg-[#9D2235]/5 text-[#9D2235]'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                            }`}
                        >
                          ${amt}
                        </button>
                      ))}
                    </div>
                    <div className="relative mb-6">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                      <input
                        type="number"
                        placeholder="Otro monto"
                        value={['10', '25', '50', '100'].includes(donationAmount) ? '' : donationAmount}
                        onChange={(e) => setDonationAmount(e.target.value)}
                        className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-lg focus:border-[#9D2235] outline-none transition-all font-semibold"
                      />
                    </div>

                    <a
                      href="/aportes"
                      className="w-full bg-[#9D2235] hover:bg-[#8B1E2F] text-white font-bold py-4 rounded-lg flex items-center justify-center gap-3 transition-colors uppercase tracking-widest text-xs"
                    >
                      <Heart className="w-5 h-5 fill-current" />
                      DONAR AHORA
                    </a>
                  </div>
                </div>
              )}

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

          <div className="space-y-3">
            {faqs.map((faq: any, index: number) => (
              <div key={index} className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full flex items-center justify-between px-6 py-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <h3 className="font-bold text-gray-900 pr-4">{faq.pregunta}</h3>
                  <ChevronDown
                    className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform duration-300 ${openFaq === index ? 'rotate-180' : ''
                      }`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${openFaq === index ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    }`}
                >
                  <p className="px-6 pb-5 text-gray-600 leading-relaxed">{faq.respuesta}</p>
                </div>
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
