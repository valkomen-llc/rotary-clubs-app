import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Heart,
  Users,
  Droplets,
  GraduationCap,
  TreePine,
  Home,
  HandHeart,
  ArrowRight,
  Target,
  TrendingUp,
  Calendar,
  MapPin,
  CheckCircle2,
  PlayCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import Navbar from '../sections/Navbar';
import Footer from '../sections/Footer';
import { useClub } from '../contexts/ClubContext';
import { useCMSContent } from '../hooks/useCMSContent';

// Proyectos activos con fundraising
const proyectosActivos = [
  {
    id: 1,
    titulo: 'Origen H2O - Agua para Comunidades Rurales',
    descripcion: 'Instalación de sistemas de agua potable en 15 comunidades rurales de Cundinamarca y Boyacá que actualmente no tienen acceso a agua limpia.',
    imagen: 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=800&h=500&fit=crop',
    categoria: 'Agua y Saneamiento',
    icono: Droplets,
    meta: 150000000,
    recaudado: 98500000,
    donantes: 342,
    diasRestantes: 45,
    beneficiarios: 8500,
    ubicacion: 'Cundinamarca & Boyacá',
    completado: false
  },
  {
    id: 2,
    titulo: 'Becas Educativas para Jóvenes Líderes 2026',
    descripcion: 'Programa de becas completas para 25 jóvenes destacados de comunidades vulnerables para acceder a educación universitaria.',
    imagen: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&h=500&fit=crop',
    categoria: 'Educación',
    icono: GraduationCap,
    meta: 200000000,
    recaudado: 156000000,
    donantes: 518,
    diasRestantes: 60,
    beneficiarios: 25,
    ubicacion: 'Nacional',
    completado: false
  },
  {
    id: 3,
    titulo: 'Reforestación de Cuencas Hídricas',
    descripcion: 'Plantación de 50,000 árboles nativos en cuencas hídricas degradadas para proteger el recurso hídrico y combatir el cambio climático.',
    imagen: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=800&h=500&fit=crop',
    categoria: 'Medio Ambiente',
    icono: TreePine,
    meta: 80000000,
    recaudado: 42300000,
    donantes: 267,
    diasRestantes: 90,
    beneficiarios: 12000,
    ubicacion: 'Santander & Norte de Santander',
    completado: false
  },
  {
    id: 4,
    titulo: 'Viviendas Dignas para Familias Afectadas',
    descripcion: 'Construcción de 30 viviendas sismorresistentes para familias que perdieron sus hogares por desastres naturales.',
    imagen: 'https://images.unsplash.com/photo-1559027615-cd4628902d4a?w=800&h=500&fit=crop',
    categoria: 'Vivienda',
    icono: Home,
    meta: 450000000,
    recaudado: 289000000,
    donantes: 892,
    diasRestantes: 120,
    beneficiarios: 150,
    ubicacion: 'Cauca & Huila',
    completado: false
  }
];

// Proyectos completados
const proyectosCompletados = [
  {
    id: 5,
    titulo: 'Campaña #TodoPorNuestrosHéroes',
    descripcion: 'Entrega de 50,000 equipos de protección personal a trabajadores de la salud durante la pandemia.',
    imagen: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&h=500&fit=crop',
    categoria: 'Salud',
    icono: HandHeart,
    meta: 250000000,
    recaudado: 267000000,
    donantes: 1247,
    fechaCompletado: 'Diciembre 2020',
    beneficiarios: 50000,
    ubicacion: 'Nacional',
    completado: true
  },
  {
    id: 6,
    titulo: 'Introcamp 2024 - Intercambio Juvenil',
    descripcion: 'Programa de bienvenida para 63 estudiantes de intercambio internacional en Colombia.',
    imagen: 'https://images.unsplash.com/photo-1531206715517-5c0ba140b2b8?w=800&h=500&fit=crop',
    categoria: 'Intercambio',
    icono: Users,
    meta: 120000000,
    recaudado: 135000000,
    donantes: 89,
    fechaCompletado: 'Enero 2024',
    beneficiarios: 63,
    ubicacion: 'Bogotá',
    completado: true
  },
  {
    id: 7,
    titulo: 'Rotary Pinta Colombia - Fase 1',
    descripcion: 'Embellecimiento de espacios públicos con murales en 10 ciudades colombianas.',
    imagen: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&h=500&fit=crop',
    categoria: 'Comunidad',
    icono: Heart,
    meta: 45000000,
    recaudado: 52000000,
    donantes: 156,
    fechaCompletado: 'Noviembre 2024',
    beneficiarios: 25000,
    ubicacion: '10 ciudades',
    completado: true
  }
];

// Impacto global
const impactoStats = [
  { valor: '150+', label: 'Proyectos Completados', icono: CheckCircle2 },
  { valor: '$12.5B', label: 'Pesos Recaudados', icono: TrendingUp },
  { valor: '50,000+', label: 'Beneficiarios', icono: Users },
  { valor: '3,500+', label: 'Donantes', icono: Heart }
];

// Cómo donar
const metodosDonacion = [
  {
    titulo: 'Donación Única',
    descripcion: 'Realiza una contribución puntual al proyecto de tu elección. Cada peso cuenta.',
    icono: Heart,
    accion: 'Donar Ahora'
  },
  {
    titulo: 'Donación Mensual',
    descripcion: 'Conviértete en un Socio Donante con aportes recurrentes y amplía tu impacto.',
    icono: Calendar,
    accion: 'Ser Socio'
  },
  {
    titulo: 'Donación Empresarial',
    descripcion: 'Tu empresa puede hacer la diferencia con contribuciones corporativas.',
    icono: Target,
    accion: 'Contactar'
  }
];

// Testimonios
const testimonios = [
  {
    nombre: 'María Elena Ríos',
    rol: 'Beneficiaria, Vereda El Carmen',
    testimonio: 'Gracias al proyecto Origen H2O, mi familia y yo tenemos agua limpia en nuestra casa. Antes caminábamos dos horas diarias para traer agua.',
    imagen: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&h=200&fit=crop'
  },
  {
    nombre: 'Carlos Andrés Martínez',
    rol: 'Becario 2023, Ingeniería',
    testimonio: 'La beca del Rotary cambió mi vida. Hoy estoy en cuarto semestre de ingeniería y sueño con devolver a mi comunidad todo lo que he recibido.',
    imagen: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop'
  },
  {
    nombre: 'Dra. Carmen Vargas',
    rol: 'Hospital Universitario',
    testimonio: 'Durante la pandemia, los equipos donados por Rotary nos salvaron la vida. No teníamos cómo protegernos hasta que llegaron.',
    imagen: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=200&h=200&fit=crop'
  }
];

// Función para formatear números cortos
const formatShort = (value: number) => {
  if (value >= 1000000000) return (value / 1000000000).toFixed(1) + 'B';
  if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
  if (value >= 1000) return (value / 1000).toFixed(0) + 'K';
  return value.toString();
};

const Proyectos = () => {
  const { club } = useClub();
  const { sections } = useCMSContent('proyectos', club.id);
  const [scrollPosition, setScrollPosition] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeProjects, setActiveProjects] = useState<any[]>([]);
  const [completedProjects, setCompletedProjects] = useState<any[]>([]);

  const getC = (section: string, field: string, fallback: string) => {
    return sections[section]?.[field] || fallback;
  }

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || '/api'}/clubs/${club.id}/projects`);
        if (response.ok) {
          const data = await response.json();
          if (data.length > 0) {
            const active = data.filter((p: any) => p.status !== 'completed').map((p: any) => ({
              ...p,
              recaudado: p.recaudado || 0, // Fallback if fields are missing in DB
              meta: p.meta || 1000,
              ubicacion: p.ubicacion || club.city,
              categoria: p.categoria || 'Servicio',
              icono: Heart // Default icon
            }));
            const completed = data.filter((p: any) => p.status === 'completed');

            if (active.length > 0) setActiveProjects(active);
            if (completed.length > 0) setCompletedProjects(completed);
          }
        }
      } catch (error) {
        console.error('Error fetching projects:', error);
      }
    };

    if (club?.id) fetchProjects();
  }, [club?.id]);

  const displayActive = [...activeProjects, ...proyectosActivos];
  const displayCompleted = [...completedProjects, ...proyectosCompletados];

  const scroll = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (container) {
      const scrollAmount = container.clientWidth;
      let newScrollPosition;

      if (direction === 'left') {
        newScrollPosition = container.scrollLeft - scrollAmount;
        if (newScrollPosition < -10) {
          newScrollPosition = container.scrollWidth - container.clientWidth;
        }
      } else {
        newScrollPosition = container.scrollLeft + scrollAmount;
        if (newScrollPosition >= container.scrollWidth - container.clientWidth - 10) {
          newScrollPosition = 0;
        }
      }

      container.scrollTo({
        left: newScrollPosition,
        behavior: 'smooth'
      });
      setScrollPosition(newScrollPosition);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      scroll('right');
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero Section - Impacto */}
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
          <div className="text-center max-w-4xl mx-auto">
            <span className="inline-block bg-rotary-gold text-white text-sm font-semibold px-4 py-1 rounded-full mb-6">
              Nuestros Proyectos
            </span>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              {getC('header', 'title', "Transformando Vidas,")} {' '}
              <span className="text-rotary-gold">{getC('header', 'highlight', "Un Proyecto a la Vez")}</span>
            </h1>
            <p className="text-white/80 text-lg md:text-xl max-w-2xl mx-auto mb-10">
              {getC('header', 'description', "Cada proyecto que emprendemos es una oportunidad de crear cambios reales y duraderos.")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="#proyectos-activos"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('proyectos-activos')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center justify-center gap-2 bg-rotary-gold text-white px-8 py-4 rounded-full font-bold hover:bg-[#c9a020] transition-colors"
              >
                <Heart className="w-5 h-5" />
                Donar Ahora
              </Link>
              <Link
                to="#como-ayudar"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('como-ayudar')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center justify-center gap-2 bg-white text-rotary-blue px-8 py-4 rounded-full font-bold hover:bg-gray-100 transition-colors"
              >
                <PlayCircle className="w-5 h-5" />
                Conoce Más
              </Link>
            </div>
          </div>
        </div>

        {/* Stats de Impacto */}
        <div className="relative bg-white/10 border-t border-white/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-10">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
              {impactoStats.map((stat, index) => (
                <div key={index} className="text-center">
                  <stat.icono className="w-6 h-6 md:w-8 md:h-8 text-rotary-gold mx-auto mb-2 md:mb-3" />
                  <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-1">{stat.valor}</div>
                  <div className="text-white/60 text-xs md:text-sm">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Proyectos Activos - Crowdfunding */}
      <section id="proyectos-activos" className="py-16 md:py-24 bg-rotary-concrete">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-block text-rotary-blue text-sm font-semibold uppercase tracking-wider mb-2">
              Campañas Activas
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Proyectos que Necesitan tu Apoyo
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Cada contribución, sin importar su tamaño, nos acerca más a nuestras metas
              y nos permite seguir transformando vidas.
            </p>
          </div>

          <div className="relative group">
            {/* Carousel Buttons */}
            <button
              onClick={() => scroll('left')}
              className="absolute -left-4 md:-left-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-white rounded-full shadow-xl flex items-center justify-center hover:bg-gray-100 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0"
            >
              <ChevronLeft className="w-6 h-6 text-rotary-blue" />
            </button>
            <button
              onClick={() => scroll('right')}
              className="absolute -right-4 md:-right-6 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-white rounded-full shadow-xl flex items-center justify-center hover:bg-gray-100 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0"
            >
              <ChevronRight className="w-6 h-6 text-rotary-blue" />
            </button>

            {/* Scrollable Container */}
            <div
              ref={scrollContainerRef}
              className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-8 pb-8 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {displayActive.map((proyecto) => {
                const porcentaje = Math.round((proyecto.recaudado / proyecto.meta) * 100);
                const Icono = proyecto.icono;

                return (
                  <div
                    key={proyecto.id}
                    className="min-w-full md:min-w-[calc(50%-16px)] lg:min-w-[calc(33.333%-21.33px)] snap-center"
                  >
                    <div className="bg-white rounded-2xl overflow-hidden border border-gray-200 transition-all h-full flex flex-col">
                      <div className="relative aspect-[16/9] overflow-hidden">
                        <img
                          src={proyecto.imagen}
                          alt={proyecto.titulo}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute top-4 left-4 flex items-center gap-2">
                          <span className="bg-rotary-gold text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                            <Icono className="w-3 h-3" />
                            {proyecto.categoria}
                          </span>
                        </div>
                        <div className="absolute bottom-4 left-4 right-4">
                          <div className="flex items-center gap-4 text-white/90 text-sm">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-4 h-4" />
                              {proyecto.ubicacion}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="p-6 flex-grow flex flex-col">
                        <h3 className="text-xl font-bold text-gray-900 mb-3 line-clamp-2 min-h-[3.5rem]">
                          {proyecto.titulo}
                        </h3>
                        <p className="text-gray-600 text-sm mb-6 line-clamp-2">
                          {proyecto.descripcion}
                        </p>

                        <div className="mt-auto">
                          {/* Barra de progreso */}
                          <div className="mb-4">
                            <div className="flex justify-between text-sm mb-2">
                              <span className="font-semibold text-rotary-blue">{porcentaje}% recaudado</span>
                              <span className="text-gray-500">{proyecto.diasRestantes} d restantes</span>
                            </div>
                            <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-rotary-blue to-rotary-gold rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(porcentaje, 100)}%` }}
                              />
                            </div>
                          </div>

                          {/* Stats resumidos */}
                          <div className="flex justify-between items-center mb-6 py-3 border-t border-b border-gray-100">
                            <div>
                              <div className="text-sm font-bold text-gray-900">${formatShort(proyecto.recaudado)}</div>
                              <div className="text-[10px] text-gray-500 uppercase">Recaudado</div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-gray-900">{proyecto.donantes}</div>
                              <div className="text-[10px] text-gray-500 uppercase">Donantes</div>
                            </div>
                          </div>

                          {/* Botón Donar */}
                          <Link
                            to={`/proyectos/${proyecto.id}`}
                            className="w-full bg-rotary-blue text-white py-3 rounded-full font-bold hover:bg-rotary-dark-blue transition-colors flex items-center justify-center gap-2 text-sm"
                          >
                            <Heart className="w-4 h-4" />
                            Ver y Donar
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Dots */}
            <div className="flex justify-center gap-2 mt-4">
              {displayActive.map((_, index) => (
                <button
                  key={index}
                  onClick={() => {
                    const container = scrollContainerRef.current;
                    if (container) {
                      container.scrollTo({
                        left: index * (container.clientWidth / (window.innerWidth >= 1024 ? 3 : window.innerWidth >= 768 ? 2 : 1)),
                        behavior: 'smooth'
                      });
                    }
                  }}
                  className={`w-2 h-2 rounded-full transition-all ${Math.round(scrollPosition / 300) === index ? 'bg-rotary-blue w-4' : 'bg-gray-300'
                    }`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Cómo Puedes Ayudar */}
      <section id="como-ayudar" className="py-16 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-block text-rotary-blue text-sm font-semibold uppercase tracking-wider mb-2">
              Participa
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              ¿Cómo Puedes Contribuir?
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Hay muchas formas de ser parte del cambio. Elige la que mejor se adapte a ti.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {metodosDonacion.map((metodo, index) => {
              const Icono = metodo.icono;
              return (
                <div key={index} className="bg-gray-50 rounded-2xl p-8 text-center hover:shadow-lg transition-shadow">
                  <div className="w-16 h-16 bg-rotary-blue/10 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Icono className="w-8 h-8 text-rotary-blue" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{metodo.titulo}</h3>
                  <p className="text-gray-600 mb-6">{metodo.descripcion}</p>
                  <button className="inline-flex items-center gap-2 text-rotary-blue font-bold hover:underline">
                    {metodo.accion}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Proyectos Completados */}
      <section className="py-16 md:py-24 bg-rotary-concrete">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-block text-rotary-blue text-sm font-semibold uppercase tracking-wider mb-2">
              Historias de Éxito
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Proyectos Completados
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Gracias al apoyo de nuestra comunidad de donantes, hemos logrado transformar miles de vidas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {displayCompleted.map((proyecto) => {
              const Icono = proyecto.icono;
              const porcentaje = Math.round((proyecto.recaudado / proyecto.meta) * 100);

              return (
                <div key={proyecto.id} className="bg-white rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-shadow">
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img
                      src={proyecto.imagen}
                      alt={proyecto.titulo}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <div className="absolute top-3 left-3">
                      <span className="bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Completado
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-3 right-3">
                      <span className="text-white/90 text-xs">{proyecto.fechaCompletado}</span>
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Icono className="w-4 h-4 text-rotary-blue" />
                      <span className="text-xs text-rotary-blue font-medium">{proyecto.categoria}</span>
                    </div>
                    <h3 className="font-bold text-gray-900 mb-2 line-clamp-2">{proyecto.titulo}</h3>
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">{proyecto.descripcion}</p>

                    <div className="flex items-center justify-between text-sm">
                      <span className="text-green-600 font-semibold">{porcentaje}% de meta</span>
                      <span className="text-gray-500">{proyecto.donantes} donantes</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonios */}
      <section
        className="py-16 md:py-24"
        style={{
          backgroundColor: '#0c3c7c',
          backgroundImage: "url('/geo-darkblue.png')",
          backgroundPosition: '50% 0',
          backgroundRepeat: 'repeat',
          backgroundSize: '71px 85px'
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-block text-rotary-gold text-sm font-semibold uppercase tracking-wider mb-2">
              Testimonios
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Historias que Inspiran
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonios.map((testimonio, index) => (
              <div key={index} className="bg-white/10 backdrop-blur-sm rounded-2xl p-8">
                <div className="flex items-center gap-4 mb-6">
                  <img
                    src={testimonio.imagen}
                    alt={testimonio.nombre}
                    className="w-16 h-16 rounded-full object-cover border-2 border-rotary-gold"
                  />
                  <div>
                    <h4 className="font-bold text-white">{testimonio.nombre}</h4>
                    <p className="text-white/60 text-sm">{testimonio.rol}</p>
                  </div>
                </div>
                <p className="text-white/80 italic leading-relaxed">
                  "{testimonio.testimonio}"
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-16 md:py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
            ¿Listo para Hacer la Diferencia?
          </h2>
          <p className="text-gray-600 text-lg mb-8 max-w-2xl mx-auto">
            Tu contribución puede cambiar vidas. Únete a miles de donantes que están
            construyendo un mundo mejor a través del Rotary Club.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#proyectos-activos"
              className="inline-flex items-center justify-center gap-2 bg-rotary-blue text-white px-8 py-4 rounded-full font-bold hover:bg-rotary-dark-blue transition-colors"
            >
              <Heart className="w-5 h-5" />
              Donar Ahora
            </a>
            <Link
              to="/quienes-somos"
              className="inline-flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-8 py-4 rounded-full font-bold hover:bg-gray-200 transition-colors"
            >
              Conoce Más
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Proyectos;
